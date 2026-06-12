/**
 * Runtime probe: frontmost app AX dump (400ms) + resolveLiveTarget.
 * Run: npx ts-node --transpile-only scripts/test-live-target-resolver-runtime.ts
 */
import * as Module from "module";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { spawnSync } from "child_process";

const userData = path.join(os.tmpdir(), "specter-live-target-runtime");
fs.mkdirSync(path.join(userData, "bin"), { recursive: true });

function mainDisplayBounds(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const py = spawnSync(
    "python3",
    [
      "-c",
      "import Quartz; b=Quartz.CGDisplayBounds(Quartz.CGMainDisplayID()); print(b.origin.x,b.origin.y,b.size.width,b.size.height)",
    ],
    { encoding: "utf8", timeout: 5_000 },
  );
  if (py.status === 0 && py.stdout.trim()) {
    const [x, y, w, h] = py.stdout.trim().split(/\s+/).map(Number);
    if ([x, y, w, h].every((n) => Number.isFinite(n))) {
      return { x, y, width: w, height: h };
    }
  }
  return { x: 0, y: 0, width: 1728, height: 1117 };
}

const displayBounds = mainDisplayBounds();
const mockDisplay = {
  id: 1,
  bounds: displayBounds,
  scaleFactor: 2,
};

const origRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (
  this: NodeModule,
  ...args: [string]
) {
  const [id] = args;
  if (id === "electron") {
    return {
      app: {
        isPackaged: false,
        getPath: (name: string) => (name === "userData" ? userData : userData),
      },
      screen: {
        getAllDisplays: () => [mockDisplay],
        getDisplayNearestPoint: () => mockDisplay,
      },
    };
  }
  return origRequire.apply(this, args);
};

async function main(): Promise<void> {
  const {
    dumpAxElements,
    getFrontmostApp,
    preferredAppIdentifier,
    getAxDumpStatus,
  } = await import("../src/main/axDump");
  const { resolveLiveTarget, invalidateLiveTargetCache } =
    await import("../src/main/automation/liveTargetResolver");

  const status = getAxDumpStatus();
  console.log(JSON.stringify({ phase: "ax_dump_status", ...status }, null, 0));

  const t0 = Date.now();
  const frontmost = await getFrontmostApp(1_500);
  const tFrontmost = Date.now() - t0;

  const appId = preferredAppIdentifier(frontmost);
  console.log(
    JSON.stringify(
      {
        phase: "frontmost",
        ms: tFrontmost,
        frontmost,
        appId,
      },
      null,
      0,
    ),
  );

  if (!appId) {
    console.log(JSON.stringify({ blocker: "no frontmost appId" }));
    process.exit(2);
  }

  const tDump0 = Date.now();
  const dump = await dumpAxElements(appId, 400);
  const tDump = Date.now() - tDump0;

  if (dump === null) {
    console.log(
      JSON.stringify({
        blocker: "dumpAxElements returned null",
        ax_permission_working: "unknown_or_timeout",
        dump_ms: tDump,
        appId,
      }),
    );
    process.exit(3);
  }

  const titles = dump.elements
    .map((e) => e.title || e.desc || e.value)
    .filter((s) => s && s.trim().length > 0)
    .slice(0, 25);

  console.log(
    JSON.stringify(
      {
        phase: "ax_dump",
        ax_permission_working: true,
        dump_ms: tDump,
        element_count: dump.elements.length,
        app: dump.app,
        pid: dump.pid,
        sample_labels: titles,
      },
      null,
      0,
    ),
  );

  const labelsToTry = [
    "Save",
    "File",
    "Edit",
    "View",
    "Window",
    "Help",
    "Cursor",
  ];
  invalidateLiveTargetCache();

  for (const label of labelsToTry) {
    invalidateLiveTargetCache();
    const tRes0 = Date.now();
    const resolved = await resolveLiveTarget(label, "click");
    const tRes = Date.now() - tRes0;
    console.log(
      JSON.stringify(
        {
          phase: "resolveLiveTarget",
          label,
          ms: tRes,
          result:
            resolved === null
              ? null
              : {
                  viewportX: resolved.viewportX,
                  viewportY: resolved.viewportY,
                  confidence: resolved.confidence,
                  matchedLabel: resolved.label,
                },
        },
        null,
        0,
      ),
    );
    if (resolved) break;
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ crash: String(err?.message ?? err) }));
  process.exit(1);
});
