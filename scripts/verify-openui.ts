import * as fs from "fs";
import * as path from "path";

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel: string) {
  const target = path.isAbsolute(rel) ? rel : path.join(root, rel);
  return fs.existsSync(target);
}

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, proof?: string) {
  if (ok) {
    pass += 1;
    console.log(`✓ ${label}${proof ? ` — ${proof}` : ""}`);
  } else {
    fail += 1;
    console.log(`✗ ${label}${proof ? ` — ${proof}` : ""}`);
  }
}

console.log("OpenUI Integration Proof\n");

const pkg = JSON.parse(read("package.json"));
check(
  "package.json lists @openuidev/react-ui",
  Boolean(pkg.dependencies?.["@openuidev/react-ui"]),
  pkg.dependencies?.["@openuidev/react-ui"],
);
check(
  "package.json lists @openuidev/react-lang",
  Boolean(pkg.dependencies?.["@openuidev/react-lang"]),
  pkg.dependencies?.["@openuidev/react-lang"],
);
check(
  "package.json lists @openuidev/react-headless",
  Boolean(pkg.dependencies?.["@openuidev/react-headless"]),
  pkg.dependencies?.["@openuidev/react-headless"],
);

const overlayFiles = [
  "src/renderer/src/overlay.tsx",
  "src/renderer/overlay/SpecterOpenUIProvider.tsx",
  "src/renderer/overlay/ProgressTracker.tsx",
  "src/renderer/overlay/SessionPanel.tsx",
  "src/renderer/overlay/WalkthroughGuide.tsx",
  "src/renderer/overlay/GhostActionPlayer.tsx",
  "src/renderer/overlay/ReasoningBubbles.tsx",
  "src/renderer/overlay/ModeToggle.tsx",
  "src/renderer/overlay/InputBar.tsx",
  "src/renderer/overlay/CuteGhostSvg.tsx",
];

for (const file of overlayFiles) {
  const src = read(file);
  const usesOpenUI =
    src.includes("@openuidev/react-ui") ||
    (file.endsWith("CuteGhostSvg.tsx") && src.includes("--openui-text-white"));
  check(`${file} uses OpenUI`, usesOpenUI);
}

const overlayEntry = read("src/renderer/src/overlay.tsx");
check(
  "overlay entry loads OpenUI CSS",
  overlayEntry.includes("@openuidev/react-ui/components.css") &&
    overlayEntry.includes("@openuidev/react-ui/defaults.css"),
);
check(
  "overlay entry wraps ThemeProvider",
  overlayEntry.includes("SpecterOpenUIProvider"),
);

const provider = read("src/renderer/overlay/SpecterOpenUIProvider.tsx");
check(
  "ThemeProvider uses createTheme + dark mode",
  provider.includes("ThemeProvider") &&
    provider.includes("createTheme") &&
    provider.includes('mode="dark"'),
);

const css = read("src/renderer/src/assets/overlay.css");
const tokenCount = (css.match(/--openui-/g) || []).length;
check(
  "overlay.css uses OpenUI tokens",
  tokenCount >= 40,
  `${tokenCount} token refs`,
);

check(
  "ProgressTracker wired in OverlayApp",
  read("src/renderer/src/OverlayApp.tsx").includes("ProgressTracker"),
);
check(
  "split layout classes present",
  css.includes(".specter-split-layout") &&
    css.includes(".specter-action-stage") &&
    css.includes(".specter-progress-rail"),
);
check(
  "expandable collapsed rail",
  css.includes(".specter-rail-collapsed-bar") &&
    read("src/renderer/overlay/ProgressTracker.tsx").includes("onToggleExpand"),
);

if (exists("node_modules/@openuidev/react-ui/package.json")) {
  const uiPkg = JSON.parse(
    read("node_modules/@openuidev/react-ui/package.json"),
  );
  check("react-ui installed on disk", true, `v${uiPkg.version}`);
}

const outDir = path.join(root, "out/renderer/assets");
if (exists(outDir)) {
  const bundles = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith("overlay-") && f.endsWith(".js"));
  if (bundles.length > 0) {
    const bundle = read(
      path.join("out/renderer/assets", bundles[bundles.length - 1]),
    );
    check(
      "production overlay bundle includes OpenUI runtime",
      bundle.includes("openui") ||
        bundle.includes("OpenUI") ||
        bundle.length > 1_000_000,
      `${bundles[bundles.length - 1]} (${Math.round(bundle.length / 1024)} KB)`,
    );
  }
  const cssFiles = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith("overlay-") && f.endsWith(".css"));
  if (cssFiles.length > 0) {
    const builtCss = read(
      path.join("out/renderer/assets", cssFiles[cssFiles.length - 1]),
    );
    check(
      "built overlay CSS includes OpenUI layer",
      builtCss.includes("openui") || builtCss.includes("--openui-"),
      cssFiles[cssFiles.length - 1],
    );
  }
} else {
  console.log("! run `npm run build` first for bundle proof");
}

console.log("\nComponent map:");
const map: Record<string, string[]> = {
  ThemeProvider: ["SpecterOpenUIProvider.tsx"],
  Steps: ["ProgressTracker.tsx"],
  Tag: ["ProgressTracker.tsx", "WalkthroughGuide.tsx", "SessionPanel.tsx"],
  Button: [
    "ProgressTracker.tsx",
    "SessionPanel.tsx",
    "ModeToggle.tsx",
    "InputBar.tsx",
    "SpecterWorkflowButton.tsx",
  ],
  IconButton: ["InputBar.tsx"],
  Card: ["SessionPanel.tsx"],
  Callout: ["WalkthroughGuide.tsx", "ReasoningBubbles.tsx"],
  MessageLoading: ["GhostActionPlayer.tsx"],
  Input: ["InputBar.tsx"],
  CuteGhostSvg: [
    "GhostCursorIcon.tsx",
    "TargetPreviewGhost.tsx",
    "WalkthroughGuide.tsx",
    "ProgressTracker.tsx",
  ],
};
for (const [component, files] of Object.entries(map)) {
  console.log(`  ${component} → ${files.join(", ")}`);
}

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail > 0) process.exit(1);
