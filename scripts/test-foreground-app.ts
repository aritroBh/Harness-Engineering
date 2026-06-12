// Focused tests for the foreground-app probe layer.
//
// Why this exists: the ghost cursor was landing on the wrong pixel for any
// app that wasn't Chrome/Safari. Root cause: when the overlay shows, Specter
// becomes NSWorkspace.frontmostApplication, so `dumpAxElements()` walked
// Specter's empty transparent window and returned no candidates, forcing
// vision-only fallback (which is shaky on niche desktop UIs). Fix: capture
// the user's foreground app *before* the overlay shows, pass it to ax-dump.
//
// These tests pin the contract for that capture path so it doesn't regress.

import {
  parseFrontmostJson,
  preferredAppIdentifier,
  type FrontmostApp,
} from "../src/main/axDump";
import { looksLikeSpecterSelf } from "../src/main/ai/screener";

interface Record {
  name: string;
  ok: boolean;
  err?: string;
}

const records: Record[] = [];

async function test(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
    records.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    records.push({ name, ok: false, err: e?.message ?? String(e) });
    console.error(`  ✗ ${name}`);
    console.error(`      ${e?.message ?? e}`);
  }
}

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  console.log("== foreground-app probe tests ==\n");

  console.log("[parser]");

  await test("parseFrontmostJson handles macOS payload", () => {
    const json = '{"bundleId":"com.apple.Notes","name":"Notes","pid":1234}';
    const result = parseFrontmostJson(json);
    assert(result, "must parse");
    assert(result!.bundleId === "com.apple.Notes", "bundleId");
    assert(result!.name === "Notes", "name");
    assert(result!.pid === 1234, "pid");
  });

  await test("parseFrontmostJson handles Windows payload (null bundleId)", () => {
    const json = '{"bundleId":null,"name":"chrome","pid":54321}';
    const result = parseFrontmostJson(json);
    assert(result, "must parse");
    assert(result!.bundleId === null, "bundleId null on Windows");
    assert(result!.name === "chrome", "name present");
    assert(result!.pid === 54321, "pid");
  });

  await test("parseFrontmostJson tolerates leading/trailing whitespace", () => {
    const json = '\n  {"bundleId":"com.apple.Mail","name":"Mail","pid":7}  \n';
    const result = parseFrontmostJson(json);
    assert(result, "must parse");
    assert(result!.bundleId === "com.apple.Mail", "bundleId");
  });

  await test("parseFrontmostJson rejects empty string", () => {
    assert(parseFrontmostJson("") === null, "empty");
    assert(parseFrontmostJson("   ") === null, "blank");
  });

  await test("parseFrontmostJson rejects non-JSON / malformed input", () => {
    assert(parseFrontmostJson("not-json") === null, "non-JSON");
    assert(parseFrontmostJson("{") === null, "truncated JSON");
    assert(parseFrontmostJson("[1,2,3]") === null, "wrong shape");
  });

  await test("parseFrontmostJson rejects payload with no bundleId AND no name", () => {
    const json = '{"bundleId":null,"name":null,"pid":99}';
    assert(parseFrontmostJson(json) === null, "must reject");
  });

  await test("parseFrontmostJson tolerates missing pid", () => {
    const json = '{"bundleId":"com.test.app","name":"Test"}';
    const result = parseFrontmostJson(json);
    assert(result, "must parse");
    assert(result!.pid === null, "pid null when absent");
  });

  console.log("\n[preferredAppIdentifier]");

  await test("prefers bundleId on macOS", () => {
    const app: FrontmostApp = {
      bundleId: "com.apple.Notes",
      name: "Notes",
      pid: 1,
    };
    assert(preferredAppIdentifier(app) === "com.apple.Notes", "bundle wins");
  });

  await test("falls back to name when bundleId missing (Windows)", () => {
    const app: FrontmostApp = { bundleId: null, name: "chrome", pid: 1 };
    assert(preferredAppIdentifier(app) === "chrome", "name fallback");
  });

  await test("returns null for null input or empty fields", () => {
    assert(preferredAppIdentifier(null) === null, "null app");
    assert(
      preferredAppIdentifier({ bundleId: null, name: null, pid: 1 }) === null,
      "all-null fields",
    );
  });

  console.log("\n[Specter-self matcher]");

  await test("flags Electron default bundle as self", () => {
    assert(looksLikeSpecterSelf("com.electron"), "com.electron");
    assert(looksLikeSpecterSelf("com.electron.app"), "with suffix");
  });

  await test("flags any com.specter.* bundle as self", () => {
    assert(looksLikeSpecterSelf("com.specter"), "base");
    assert(looksLikeSpecterSelf("com.specter.dev"), "dev");
    assert(looksLikeSpecterSelf("com.specter.app"), "app");
  });

  await test("flags 'Specter' or 'Electron' localized names as self", () => {
    assert(looksLikeSpecterSelf("Specter"), "Specter");
    assert(looksLikeSpecterSelf("Electron"), "Electron");
  });

  await test("does NOT flag the apps Specter is supposed to teach against", () => {
    assert(!looksLikeSpecterSelf("com.apple.Notes"), "Notes");
    assert(!looksLikeSpecterSelf("com.apple.mail"), "Mail");
    assert(!looksLikeSpecterSelf("com.google.Chrome"), "Chrome");
    assert(!looksLikeSpecterSelf("com.apple.Safari"), "Safari");
    assert(!looksLikeSpecterSelf("com.tinyspeck.slackmacgap"), "Slack");
    assert(
      !looksLikeSpecterSelf("com.citrix.receiver.icaviewer.mac"),
      "Citrix",
    );
    assert(!looksLikeSpecterSelf("com.epic.hyperspace"), "Epic Hyperspace");
    assert(!looksLikeSpecterSelf("com.microsoft.VSCode"), "VS Code");
  });

  await test("handles empty string safely", () => {
    assert(!looksLikeSpecterSelf(""), "empty");
  });

  console.log("\n[summary]");
  const passed = records.filter((r) => r.ok).length;
  const failed = records.length - passed;
  console.log(`${passed} passed, ${failed} failed, ${records.length} total\n`);
  if (failed > 0) {
    console.error("FAILED:");
    for (const r of records.filter((r) => !r.ok)) {
      console.error(`  - ${r.name}: ${r.err}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[test-foreground-app] crashed:", err);
  process.exit(1);
});
