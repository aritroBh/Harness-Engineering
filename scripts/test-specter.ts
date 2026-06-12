import * as fs from "fs";
import * as path from "path";

type CheckKind = "pass" | "fail" | "warn";

async function main() {
  const { default: chalk } = await import("chalk");
  const root = process.cwd();

  let passed = 0;
  let failed = 0;
  let warned = 0;

  function printHeader(title: string) {
    console.log("\n" + chalk.cyan.bold("== " + title + " =="));
  }

  function report(kind: CheckKind, msg: string) {
    if (kind === "pass") {
      passed++;
      console.log(chalk.green.bold("PASS") + " " + msg);
    } else if (kind === "warn") {
      warned++;
      console.log(chalk.yellow.bold("WARN") + " " + msg);
    } else {
      failed++;
      console.log(chalk.red.bold("FAIL") + " " + msg);
    }
  }

  function check(condition: boolean, msg: string) {
    report(condition ? "pass" : "fail", msg);
  }

  function warnIf(condition: boolean, msg: string) {
    report(condition ? "pass" : "warn", msg);
  }

  function filePath(p: string): string {
    return path.join(root, p);
  }

  function fileExists(p: string): boolean {
    return fs.existsSync(filePath(p));
  }

  function readFile(p: string): string {
    return fs.readFileSync(filePath(p), "utf-8");
  }

  function listFiles(dir: string): string[] {
    const absolute = filePath(dir);
    if (!fs.existsSync(absolute)) return [];

    return fs
      .readdirSync(absolute, { withFileTypes: true })
      .flatMap((entry) => {
        const child = path.join(dir, entry.name);
        if (entry.isDirectory()) return listFiles(child);
        return [child];
      });
  }

  function cssSelectorRuleContains(
    source: string,
    selector: string,
    declaration: RegExp,
  ): boolean {
    return Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g)).some(
      (match) => {
        const selectors = match[1].split(",").map((entry) => entry.trim());
        return selectors.includes(selector) && declaration.test(match[2]);
      },
    );
  }

  function exportedFunctionBody(
    source: string,
    name: string,
    nextName?: string,
  ): string {
    const start = source.indexOf(`export async function ${name}`);
    if (start === -1) return "";
    const end = nextName
      ? source.indexOf(`export async function ${nextName}`, start + 1)
      : -1;
    return source.slice(start, end === -1 ? undefined : end);
  }

  function functionBody(
    source: string,
    name: string,
    nextName?: string,
  ): string {
    const start = source.indexOf(`function ${name}`);
    if (start === -1) return "";
    const end = nextName
      ? source.indexOf(`function ${nextName}`, start + 1)
      : -1;
    return source.slice(start, end === -1 ? undefined : end);
  }

  printHeader("Files");

  const requiredFiles = [
    "package.json",
    "package-lock.json",
    "src/main/index.ts",
    "src/main/cursor.ts",
    "src/main/capture.ts",
    "src/main/permissions.ts",
    "src/main/ai/config.ts",
    "src/main/ai/health.ts",
    "src/main/ai/planner.ts",
    "src/main/ai/screener.ts",
    "src/main/ai/tts.ts",
    "src/main/ai/whisper.ts",
    "src/main/behavioral/model.ts",
    "src/main/behavioral/tracker.ts",
    "src/main/session/types.ts",
    "src/main/session/graph.ts",
    "src/main/session/storage.ts",
    "src/main/session/recorder.ts",
    "src/main/session/replay.ts",
    "src/main/session/replayAuto.ts",
    "src/main/session/mirrorReplay.ts",
    "src/main/session/replayController.ts",
    "src/main/session/replaySafety.ts",
    "src/main/userCursor.ts",
    "src/main/screenCoordinates.ts",
    "src/preload/index.ts",
    "src/preload/overlay.ts",
    "src/renderer/src/overlay.tsx",
    "src/renderer/src/OverlayApp.tsx",
    "src/renderer/overlay/GhostCursor.tsx",
    "src/renderer/overlay/SpecBuddy.tsx",
    "src/renderer/overlay/InputBar.tsx",
    "src/renderer/overlay/MicRecorder.ts",
    "src/renderer/overlay/ModeToggle.tsx",
    "src/renderer/overlay/SessionPanel.tsx",
    "src/renderer/src/assets/overlay.css",
    "docs/manual-stress-test-checklist.md",
    "docs/reality-lock.md",
  ];

  for (const file of requiredFiles) {
    check(fileExists(file), `${file} exists`);
  }

  const mainIndex = readFile("src/main/index.ts");
  const overlayAppBody = readFile("src/renderer/src/OverlayApp.tsx");
  const screenerBody = readFile("src/main/ai/screener.ts");
  const plannerBody = readFile("src/main/ai/planner.ts");
  const inputBarBody = readFile("src/renderer/overlay/InputBar.tsx");
  const whisperBody = readFile("src/main/ai/whisper.ts");
  const practicePreloadBody = readFile("src/preload/index.ts");
  const preloadBody = readFile("src/preload/overlay.ts");
  const overlayCss = readFile("src/renderer/src/assets/overlay.css");
  const captureBody = readFile("src/main/capture.ts");
  const screenCoordinatesBody = readFile("src/main/screenCoordinates.ts");
  const demoWorkflowBody = readFile("src/main/session/demoWorkflow.ts");
  const replayBody = readFile("src/main/session/replay.ts");
  const walkthroughGuide = readFile(
    "src/renderer/overlay/WalkthroughGuide.tsx",
  );
  const targetPreviewGhost = readFile(
    "src/renderer/overlay/TargetPreviewGhost.tsx",
  );

  printHeader("Environment");

  const envPath = filePath(".env");
  const envContent = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf-8")
    : "";
  const gitignore = fileExists(".gitignore") ? readFile(".gitignore") : "";
  const sourceFiles = listFiles("src").filter((file) =>
    /\.(ts|tsx)$/.test(file),
  );
  const rendererFilesReadingOpenAIKey = sourceFiles.filter((file) => {
    const content = readFile(file);
    return (
      (file.includes("/renderer/") || file.includes("/preload/")) &&
      /process\.env\.OPENAI_API_KEY|import\.meta\.env\.[A-Z0-9_]*OPENAI_API_KEY/.test(
        content,
      )
    );
  });

  warnIf(fs.existsSync(envPath), ".env exists at project root");
  check(
    gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .includes(".env"),
    ".env is listed in .gitignore",
  );
  check(
    rendererFilesReadingOpenAIKey.length === 0,
    "OPENAI_API_KEY is not read from renderer/preload code",
  );

  for (const key of [
    "ANTHROPIC_API_KEY",
    "NVIDIA_API_KEY",
    "ELEVENLABS_API_KEY",
    "OPENAI_API_KEY",
  ]) {
    const match = envContent.match(new RegExp("^" + key + "=(.+)$", "m"));
    warnIf(
      Boolean(match && match[1].trim()),
      `${key} is present and non-empty in .env`,
    );
  }

  printHeader("Package Scripts");

  const pkg = JSON.parse(readFile("package.json"));
  check(Boolean(pkg.scripts?.dev), "package.json has npm run dev");
  check(Boolean(pkg.scripts?.build), "package.json has npm run build");
  check(
    Boolean(pkg.scripts?.["test:specter"]),
    "package.json has npm run test:specter",
  );
  check(
    Boolean(pkg.scripts?.["security-check"]),
    "package.json has npm run security-check",
  );
  check(
    Boolean(pkg.scripts?.lint) && !pkg.scripts.lint.includes("--fix"),
    "npm run lint checks without mutating source",
  );
  check(
    Boolean(pkg.scripts?.["lint:fix"]) &&
      pkg.scripts["lint:fix"].includes("--fix"),
    "package.json has npm run lint:fix for mutating lint fixes",
  );

  printHeader("Overlay Contract");

  check(
    overlayCss.includes("@property --angle"),
    "overlay.css keeps @property --angle",
  );
  check(
    /siri-spin\s+[5-8]s/.test(overlayCss),
    "overlay.css keeps 5–8s Siri-style conic rotation",
  );
  check(
    overlayCss.includes("--edge-band") && overlayCss.includes("--edge-bloom"),
    "overlay.css defines a wider edge band and bloom",
  );
  check(
    overlayCss.includes("mix-blend-mode: screen"),
    "edge glow uses screen blending for varied backgrounds",
  );
  check(
    /padding:\s*var\(--edge-band\)/.test(overlayCss),
    "crisp edge ring uses the wider visible band",
  );
  check(
    !overlayCss.includes("siri-glow-thin"),
    "old siri-glow-thin animation name is absent",
  );
  check(
    !overlayCss.includes("background: #000"),
    "overlay.css does not force an opaque black background",
  );

  const overlayEntry = readFile("src/renderer/src/overlay.tsx");
  check(
    !overlayEntry.includes("React.StrictMode"),
    "overlay entry does not wrap OverlayApp in React.StrictMode",
  );

  const ghostCursor = readFile("src/renderer/overlay/GhostCursor.tsx");
  check(
    ghostCursor.includes("step.viewportX ?? step.x") &&
      ghostCursor.includes("step.viewportY ?? step.y"),
    "GhostCursor uses normalized viewport x/y with legacy fallback",
  );
  check(
    !ghostCursor.includes("targetX") && !ghostCursor.includes("targetY"),
    "GhostCursor does not use targetX/targetY",
  );
  const ghostCursorIcon = readFile("src/renderer/overlay/GhostCursorIcon.tsx");
  const cuteGhostSvg = readFile("src/renderer/overlay/CuteGhostSvg.tsx");
  check(
    ghostCursor.includes("GhostCursorIcon") &&
      ghostCursorIcon.includes("CuteGhostSvg") &&
      cuteGhostSvg.includes("--openui-text-white"),
    "GhostCursor uses cute OpenUI-tokenized ghost mascot",
  );
  check(
    !ghostCursor.includes("cursor-dot") &&
      !ghostCursor.includes("#7c3aed") &&
      !cuteGhostSvg.includes("M5.5 3.21"),
    "GhostCursor is a cute ghost, not pointer dot/orb/arrow",
  );
  check(
    readFile("src/renderer/overlay/ProgressTracker.tsx").includes(
      "specter-rail-steps-list--full",
    ) &&
      readFile("src/renderer/overlay/stepHistory.ts").includes(
        "sessionComplete",
      ),
    "ProgressTracker shows full step list with persistent session state",
  );
  check(
    overlayCss.includes(".specter-rail-collapsed-bar"),
    "collapsed progress rail shows vertical progress indicator",
  );
  check(
    readFile("src/renderer/src/OverlayApp.tsx").includes("ProgressTracker") &&
      readFile("src/renderer/src/OverlayApp.tsx").includes("sessionComplete"),
    "OverlayApp wires ProgressTracker with persistent step session",
  );

  const pkgJson = JSON.parse(readFile("package.json"));
  check(
    Boolean(pkgJson.dependencies?.["@openuidev/react-ui"]),
    "package.json depends on @openuidev/react-ui",
  );
  check(
    overlayEntry.includes("@openuidev/react-ui/components.css") &&
      overlayEntry.includes("SpecterOpenUIProvider"),
    "overlay entry loads OpenUI CSS and ThemeProvider wrapper",
  );
  check(
    readFile("src/renderer/overlay/InputBar.tsx").includes(
      "@openuidev/react-ui",
    ) &&
      readFile("src/renderer/overlay/InputBar.tsx").includes("<Input") &&
      readFile("src/renderer/overlay/InputBar.tsx").includes("<IconButton"),
    "InputBar uses OpenUI Input and IconButton",
  );
  check(
    readFile("src/renderer/overlay/ModeToggle.tsx").includes("<Buttons") &&
      readFile("src/renderer/overlay/ModeToggle.tsx").includes("<Button"),
    "ModeToggle uses OpenUI Buttons and Button",
  );
  check(
    overlayAppBody.includes("SpecterWorkflowButton") &&
      !overlayAppBody.includes('className="specter-action-button'),
    "workflow actions use OpenUI SpecterWorkflowButton",
  );
  check(
    (overlayCss.match(/--openui-/g) || []).length >= 40,
    "overlay.css references 40+ OpenUI design tokens",
  );
  check(
    Boolean(pkgJson.scripts?.["verify:openui"]),
    "package.json exposes npm run verify:openui proof script",
  );

  printHeader("Renderer Stability");

  check(
    overlayAppBody.includes("api.planSteps(trimmed, res, [], mode)"),
    "OverlayApp passes fresh analyze result to planSteps",
  );
  check(
    /try\s*{[\s\S]*api\.(analyzeScreen|detectRealAppTargets)\([\s\S]*catch\s*\(/.test(
      overlayAppBody,
    ),
    "intent submission is wrapped in try/catch",
  );
  check(
    /finally\s*{[\s\S]*setIsLoading\(false\)/.test(overlayAppBody),
    "intent submission clears loading in finally",
  );
  check(
    overlayAppBody.includes("setErrorMessage("),
    "OverlayApp can show a visible error message",
  );
  check(
    overlayAppBody.includes("Walk me through") ||
      overlayAppBody.includes("onWalkthrough"),
    "renderer exposes walkthrough replay UI",
  );
  check(
    overlayAppBody.includes("Do it for me") ||
      overlayAppBody.includes("onAutoExecute"),
    "renderer exposes auto-execute replay UI",
  );
  check(
    /speakIfUltra[\s\S]*?(modeRef\.current|currentMode) === ['"]ultra['"]/.test(
      overlayAppBody,
    ),
    "Ultra mode conditionally starts TTS through speakIfUltra",
  );
  check(
    overlayAppBody.includes("api.stopSpeaking"),
    "Silent mode stops/avoids speech",
  );
  check(
    overlayAppBody.includes("[ULTRA] skipped because silent mode"),
    "Silent mode logs skipped TTS",
  );
  check(
    overlayAppBody.includes("mode,") && overlayAppBody.includes("real-app"),
    "real-app workflow preserves the current mode",
  );
  check(
    overlayAppBody.includes("SHOW_WALKTHROUGH_DEBUG") &&
      overlayAppBody.includes("walkthrough-debug-pill"),
    "OverlayApp has dev-only walkthrough step/coordinate debug pill",
  );

  printHeader("Preload IPC");

  check(
    mainIndex.includes("../preload/index.js") &&
      mainIndex.includes("../preload/overlay.js"),
    "practice and overlay windows use split preload bundles",
  );
  check(
    !practicePreloadBody.includes("ipcRenderer") &&
      !practicePreloadBody.includes("moveRealMouse"),
    "practice preload does not expose privileged IPC helpers",
  );
  check(
    preloadBody.includes("return () => ipcRenderer.removeListener"),
    "overlay preload listener helpers return unsubscribe cleanup",
  );

  for (const exposed of [
    "moveRealMouse",
    "clickRealMouse",
    "executeRealMouseSteps",
    "planSteps",
    "checkAIBackend",
    "walkthrough",
    "autoExecute",
    "stopReplay",
    "onReplayStep",
    "onReplayProgress",
  ]) {
    check(preloadBody.includes(exposed), `preload exposes ${exposed}`);
  }

  // Verify every api.<method>( call in OverlayApp has a matching preload key.
  // This catches the class of bug where the renderer calls a method that the
  // preload never exposed, which fails silently at runtime.
  {
    const apiCallPattern = /\bapi\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    const rendererMethods = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = apiCallPattern.exec(overlayAppBody)) !== null) {
      rendererMethods.add(m[1]);
    }
    const criticalMethods = [
      "healthCheck",
      "checkAIBackend",
      "testVoiceOutput",
      "ultraConverse",
      "transcribe",
      "speak",
      "planSteps",
      "analyzeScreen",
      "moveRealMouse",
    ];
    for (const method of criticalMethods) {
      check(
        preloadBody.includes(`${method}:`),
        `preload exposes critical renderer API method: ${method}`,
      );
    }
    Array.from(rendererMethods).forEach((method) => {
      // Skip event-listener helpers (onXxx) — they're pattern-matched above
      if (method.startsWith("on")) return;
      check(
        preloadBody.includes(`${method}:`),
        `renderer calls api.${method}() and preload exposes it`,
      );
    });
  }

  printHeader("Real-App Target Confirmation");

  const createRealAppStepBody = functionBody(
    mainIndex,
    "createRealAppStep",
    "realAppNodeId",
  );

  check(
    !/const\s+bestTarget\s*=\s*normalizedTargets\[0\][\s\S]{0,300}setSelectedRealAppTarget\(bestTarget\)/.test(
      overlayAppBody,
    ) &&
      !/setSelectedRealAppTarget\(\s*normalizedTargets\[0\]\s*\)/.test(
        overlayAppBody,
      ),
    "real-app flow does not auto-start or auto-select normalizedTargets[0]",
  );
  check(
    overlayAppBody.includes("Does this look right?") &&
      overlayAppBody.includes(
        "Specter is previewing where it will guide you.",
      ) &&
      overlayAppBody.includes("specter-target-list"),
    "renderer shows preview-oriented confirmation copy",
  );
  check(
    overlayAppBody.includes("NORMAL_TARGET_LIMIT = 3") &&
      overlayAppBody.includes("DEBUG_TARGET_LIMIT = 10") &&
      overlayAppBody.includes("targetCandidateLimit") &&
      overlayAppBody.includes("displayedRealAppTargets"),
    "normal mode limits target candidates to 3 and debug mode allows 10",
  );
  check(
    overlayAppBody.includes("displayedRealAppTargets.map") &&
      !overlayAppBody.includes("realAppMarkerTargets.map"),
    "hidden candidates do not render markers or rows",
  );
  check(
    /showDebugTools\s*\?[\s\S]{0,120}confidencePercent\(target\.confidence\)/.test(
      overlayAppBody,
    ) &&
      /showDebugTools\s*&&[\s\S]{0,120}<em>\{confidencePercent\(target\.confidence\)\}<\/em>/.test(
        overlayAppBody,
      ),
    "confidence percentages are hidden outside Debug mode",
  );
  check(
    /disabled=\{isLoading \|\| !selectedRealAppTarget\}[\s\S]{0,120}Start ghost/.test(
      overlayAppBody,
    ),
    "Start ghost is disabled until a target is selected",
  );
  check(
    (overlayAppBody.includes("SpecterWorkflowButton") &&
      overlayAppBody.includes("primary") &&
      overlayAppBody.includes("startManualTargetPicking") &&
      overlayAppBody.includes(
        "Click the exact spot you want Specter to teach.",
      )) ||
      (overlayAppBody.includes("is-manual-primary") &&
        overlayAppBody.includes("startManualTargetPicking") &&
        overlayAppBody.includes(
          "Click the exact spot you want Specter to teach.",
        )),
    "Pick manually is prominent and uses exact-spot instruction",
  );
  check(
    overlayAppBody.includes("specter-workflow-title") &&
      overlayAppBody.includes("Does this look right?") &&
      !/specter-workflow-title[\s\S]{0,180}realAppTargets\?\.microTask/.test(
        overlayAppBody,
      ),
    "panel title uses stable copy, not detected target labels",
  );
  check(
    overlayAppBody.includes("specter-target-marker") &&
      overlayCss.includes(".specter-target-marker.is-selected") &&
      overlayCss.includes(".specter-target-list-item.is-hovered") &&
      /showDebugTools[\s\S]{0,900}specter-target-marker/.test(overlayAppBody),
    "marker styles exist, synchronize hover/selected states, and are gated behind showDebugTools",
  );
  check(
    overlayAppBody.includes("is-debug-targets") &&
      overlayCss.includes(".specter-workflow-card.is-debug-targets") &&
      overlayCss.includes("max-height") &&
      overlayAppBody.includes("More candidates available in Debug."),
    "Debug mode can expose more candidate details without bloating normal mode",
  );
  check(
    overlayAppBody.includes("[SCREEN_TARGETS] candidate list") &&
      mainIndex.includes("[SCREEN_TARGETS] candidate list"),
    "candidate list logging exists in renderer and main",
  );
  check(
    mainIndex.includes('ipcMain.handle("coordinate:mapPercentToScreen"') &&
      preloadBody.includes("coordinate:mapPercentToScreen") &&
      preloadBody.includes("mapPercentToScreen"),
    "coordinate:mapPercentToScreen IPC exists and is exposed",
  );
  check(
    overlayAppBody.includes("[COORD_ALIGNMENT] target mapping") &&
      overlayAppBody.includes("expectedScreenPixel") &&
      overlayAppBody.includes("overlayViewport"),
    "renderer logs target coordinate alignment details",
  );
  check(
    screenCoordinatesBody.includes("export interface ViewportPercentTarget") &&
      screenCoordinatesBody.includes(
        "normalizeCapturedTargetToViewportPercent",
      ) &&
      screenCoordinatesBody.includes(
        "normalizePracticeWindowTargetToViewportPercent",
      ),
    "screenCoordinates defines a canonical viewport coordinate conversion contract",
  );
  check(
    captureBody.includes("CaptureFrameMeta") &&
      captureBody.includes("captureMetaForActiveDisplay") &&
      captureBody.includes("imageWidth") &&
      captureBody.includes("imageHeight") &&
      screenCoordinatesBody.includes("displayBounds") &&
      screenCoordinatesBody.includes("captureBounds") &&
      screenCoordinatesBody.includes("overlayBounds") &&
      screenCoordinatesBody.includes("scaleFactor") &&
      screenCoordinatesBody.includes("coordinateMode"),
    "capture metadata includes image, capture, display, overlay, scale, and coordinate mode",
  );
  check(
    mainIndex.includes("normalizeCapturedTargetToViewportPercent") &&
      mainIndex.includes("[COORD_FRAME] raw target") &&
      mainIndex.includes("[COORD_FRAME] normalized target") &&
      mainIndex.includes("captureMeta: screenshotResult.meta"),
    "VLM/capture targets are normalized to viewport coordinates before renderer usage",
  );
  check(
    screenCoordinatesBody.includes('sourceFrame === "manual"') &&
      screenCoordinatesBody.includes('target.coordinateFrame === "viewport"') &&
      overlayAppBody.includes('sourceFrame: "manual"') &&
      overlayAppBody.includes('coordinateFrame: "viewport"'),
    "manual targets are already viewport-frame and bypass capture normalization",
  );
  check(
    demoWorkflowBody.includes(
      "normalizePracticeWindowTargetToViewportPercent",
    ) &&
      demoWorkflowBody.includes('sourceFrame: "practice-window"') &&
      demoWorkflowBody.includes('coordinateFrame: "viewport"'),
    "practice workspace targets are converted from practice-window frame to viewport frame",
  );
  check(
    overlayAppBody.includes("[COORD_FRAME] marker render position") &&
      replayBody.includes("[COORD_FRAME] ghost endpoint") &&
      overlayAppBody.includes("[COORD_FRAME] ghost endpoint"),
    "coordinate-frame logs exist for marker render and ghost endpoints",
  );
  check(
    mainIndex.includes("[REAL_APP_WALKTHROUGH] confirmed target") &&
      overlayAppBody.includes("[REAL_APP_WALKTHROUGH] confirmed target") &&
      overlayAppBody.includes(
        "[REAL_APP_WALKTHROUGH] start from preview target",
      ),
    "walkthrough start logs the confirmed real-app target and preview target",
  );
  check(
    fileExists("src/renderer/overlay/TargetPreviewGhost.tsx"),
    "TargetPreviewGhost component exists",
  );
  check(
    targetPreviewGhost.includes('pointerEvents: "none"') &&
      targetPreviewGhost.includes('position: "fixed"') &&
      targetPreviewGhost.includes("9999"),
    "TargetPreviewGhost uses pointer-events: none and fixed positioning",
  );
  check(
    /showDebugTools\s*&&\s*[\s\S]{0,80}displayedRealAppTargets\.map/.test(
      overlayAppBody,
    ),
    "normal mode does not render all candidate numbered dots",
  );
  check(
    overlayAppBody.includes("TargetPreviewGhost") &&
      overlayAppBody.includes("previewGhostStart") &&
      overlayAppBody.includes("computePreviewGhostStart"),
    "OverlayApp integrates preview ghost and start-point computation",
  );
  check(
    overlayAppBody.includes("Previewing: ") &&
      overlayAppBody.includes("Pick a target to preview."),
    "confirmation card copy includes preview language",
  );
  check(
    overlayAppBody.includes("handleManualTargetPick") &&
      overlayAppBody.includes("setSelectedRealAppTarget") &&
      overlayAppBody.includes("setPreviewGhostStart"),
    "manual pick selects a preview target before starting walkthrough",
  );
  const viewportCoords = readFile("src/renderer/overlay/viewportCoords.ts");
  check(
    viewportCoords.includes("CURSOR_HOTSPOT") &&
      viewportCoords.includes("cursorTransform") &&
      viewportCoords.includes("percentToPixels") &&
      targetPreviewGhost.includes("cursorTransform"),
    "TargetPreviewGhost uses transform translate3d with hotspot correction",
  );
  check(
    targetPreviewGhost.includes("[PREVIEW_GHOST] endpoint"),
    "TargetPreviewGhost logs endpoint coordinate on arrival",
  );
  check(
    !/className.*specter-target-marker/.test(overlayAppBody) ||
      /showDebugTools[\s\S]{0,900}specter-target-marker/.test(overlayAppBody),
    "specter-target-marker is only rendered when showDebugTools is true",
  );
  check(
    screenerBody.includes("Chrome tab prompts") &&
      screenerBody.includes("New tab button") &&
      screenerBody.includes("Tab strip") &&
      screenerBody.includes("Do not choose page content"),
    "screener prompt includes Chrome tabs/new tab/tab strip guidance",
  );
  check(
    overlayAppBody.includes(
      "Click the exact spot you want the ghost cursor to teach.",
    ) &&
      overlayAppBody.includes("event.currentTarget.getBoundingClientRect()") &&
      overlayAppBody.includes("window.innerWidth") &&
      overlayAppBody.includes("window.innerHeight"),
    "manual target pick uses full viewport instructions and frame",
  );
  check(
    ghostCursor.includes("step.viewportX ?? step.x") &&
      ghostCursor.includes("step.viewportY ?? step.y") &&
      ghostCursor.includes("cursorTransform") &&
      overlayAppBody.includes("step={currentStep}") &&
      overlayAppBody.includes("window.innerWidth") &&
      overlayAppBody.includes("window.innerHeight") &&
      walkthroughGuide.includes("step.viewportX ?? step.x") &&
      walkthroughGuide.includes("centerTransform"),
    "markers, GhostCursor, and guide use the same normalized viewport percent fields",
  );
  check(
    createRealAppStepBody.includes("target?.viewportX ?? target?.x") &&
      createRealAppStepBody.includes("target?.viewportY ?? target?.y") &&
      createRealAppStepBody.includes('coordinateFrame: "viewport"') &&
      createRealAppStepBody.includes("rawTarget: target?.rawTarget"),
    "createRealAppStep preserves normalized viewport x/y and raw target debug data",
  );

  printHeader("Whisper and Mic");

  const micRecorder = readFile("src/renderer/overlay/MicRecorder.ts");
  const transcribeBody = exportedFunctionBody(whisperBody, "transcribe");
  const openAICallIndex = transcribeBody.indexOf(
    "openai.audio.transcriptions.create",
  );
  const emptyBufferGuardIndex = transcribeBody.indexOf(
    "audioBuffer.length === 0",
  );

  check(
    whisperBody.includes("classifyWhisperError"),
    "whisper.ts classifies errors for the renderer",
  );
  check(
    whisperBody.includes("WhisperResult"),
    "whisper.ts returns structured result objects",
  );
  check(
    whisperBody.includes("gpt-4o-mini-transcribe") &&
      whisperBody.includes("whisper-1"),
    "whisper.ts supports gpt-4o-mini-transcribe with whisper-1 fallback",
  );
  check(
    inputBarBody.includes('result.message || "No transcription returned'),
    "InputBar displays specific Whisper error messages",
  );

  check(
    !/new\s+File\s*\(/.test(whisperBody),
    "whisper.ts does not use global File",
  );
  check(
    /import \{ toFile \} from ['"]openai\/uploads['"]/.test(whisperBody),
    "whisper.ts uses toFile from openai/uploads",
  );
  check(
    /import \{ File as NodeFile \} from ['"]node:buffer['"]/.test(whisperBody),
    "whisper.ts imports File as NodeFile from node:buffer",
  );
  check(
    whisperBody.includes("globalThis.File") &&
      whisperBody.includes("undefined"),
    "whisper.ts assigns globalThis.File when undefined",
  );
  check(
    emptyBufferGuardIndex !== -1 &&
      (openAICallIndex === -1 || emptyBufferGuardIndex < openAICallIndex),
    "Whisper returns before OpenAI when buffer length is 0",
  );
  check(
    whisperBody.includes(
      "[WHISPER] installed Node File polyfill for OpenAI uploads",
    ),
    "whisper.ts logs File polyfill installation",
  );
  check(
    whisperBody.includes("[WHISPER] received buffer"),
    "whisper.ts logs buffer reception",
  );
  check(
    whisperBody.includes("[WHISPER] transcription success") &&
      whisperBody.includes("textLength"),
    "whisper.ts logs transcription success with textLength",
  );
  check(
    whisperBody.includes("[WHISPER] transcription failed completely"),
    "whisper.ts logs transcription failures",
  );
  check(
    mainIndex.includes("bufferFromAudioData") &&
      mainIndex.includes("convertedBufferLength"),
    "whisper IPC robustly converts ArrayBuffer and logs converted length",
  );
  check(
    micRecorder.includes("MediaRecorder.isTypeSupported") &&
      micRecorder.includes("audio/webm;codecs=opus"),
    "MicRecorder chooses supported mime type with fallback",
  );
  check(
    micRecorder.includes("start(250)") && micRecorder.includes("requestData()"),
    "MicRecorder starts with timeslice and requests final data before stop",
  );
  check(
    micRecorder.includes("[MIC] final blob size") &&
      inputBarBody.includes("No audio captured. Speak a little longer."),
    "MicRecorder/InputBar handle zero-byte recordings without Whisper",
  );
  check(
    inputBarBody.includes("handleCancel") &&
      inputBarBody.includes("onCancel={handleCancel}") &&
      inputBarBody.includes("Escape"),
    "InputBar safely stops recording via cancel button or Escape",
  );
  check(
    inputBarBody.includes("setValue(text)") &&
      !inputBarBody.includes("onSubmit(text)"),
    "transcription populates input instead of submitting empty/implicit text",
  );
  check(
    whisperBody.includes("WHISPER_TIMEOUT_MS") &&
      whisperBody.includes("Promise.race"),
    "whisper.ts implements transcription timeout via Promise.race",
  );
  check(
    inputBarBody.includes("Transcription timed out"),
    "InputBar displays timeout message on WHISPER_TIMEOUT",
  );
  check(
    inputBarBody.includes("Microphone unavailable") ||
      inputBarBody.includes("microphone:unavailable"),
    "InputBar displays friendly microphone unavailable errors",
  );
  check(
    inputBarBody.includes('setMicState("idle")') &&
      inputBarBody.includes("recordingStartRef.current = null"),
    "InputBar guarantees mic state resets to idle after failure",
  );
  check(
    inputBarBody.includes("Promise.race") &&
      inputBarBody.includes("api.transcribe"),
    "InputBar uses Promise.race for api.transcribe timeout",
  );
  check(
    !/if\s*\(\s*micState\s*!==\s*["']idle["']\s*\)\s*setMicState\(\s*["']idle["']\s*\)/.test(
      inputBarBody,
    ),
    "InputBar mic reset does not use stale micState condition",
  );
  check(
    !/export\s+async\s+function\s+transcribe[\s\S]*?typeof\s+globalThis\.File/.test(
      whisperBody,
    ),
    "whisper.ts installs globalThis.File at module load, not inside transcribe",
  );

  printHeader("Planner and Screener Safety");

  const analyzeScreenBody = exportedFunctionBody(screenerBody, "analyzeScreen");

  check(
    plannerBody.includes("safeScreenState") &&
      plannerBody.includes("coordinatesFrom"),
    "planner guards nullable screen state",
  );
  check(
    plannerBody.includes("partial.x ?? partial.targetX") &&
      plannerBody.includes("partial.y ?? partial.targetY"),
    "planner accepts legacy targetX/targetY input",
  );
  check(
    !/targetX\s*:/.test(plannerBody),
    "planner does not emit targetX as an object key",
  );
  check(
    plannerBody.includes("x: clampCoordinate") &&
      plannerBody.includes("y: clampCoordinate"),
    "planner normalizes output to x/y",
  );
  check(
    screenerBody.includes('app: "Unknown"') &&
      screenerBody.includes("coordinates: []"),
    "screener fallback is { app: Unknown, coordinates: [] }",
  );
  check(
    !/return\s+null/.test(analyzeScreenBody),
    "analyzeScreen does not return null on failures",
  );
  check(
    mainIndex.includes("fallbackScreenState()"),
    "main screen:analyze handler returns fallback on capture/analyze failure",
  );

  const replayController = readFile("src/main/session/replayController.ts");

  printHeader("Click-Through Safety");

  const restoreOverlayBody = exportedFunctionBody(
    replayController,
    "restoreOverlayAfterReplay",
  );
  check(
    !restoreOverlayBody.includes("overlayWindow.setIgnoreMouseEvents(false)"),
    "restoreOverlayAfterReplay does not force interactive by default",
  );
  const detectTargetsBody = exportedFunctionBody(
    mainIndex,
    "realApp:detectTargets",
  );
  check(
    !detectTargetsBody.includes("setIgnoreMouseEvents(false)"),
    "realApp:detectTargets restores click-through true after capture",
  );
  check(
    /if \(wasOverlayVisible && overlayWindow\) \{\s*safeLog\(['"]\[CAPTURE_UNDERLYING\] hiding overlay before screen capture['"]\);/.test(
      mainIndex,
    ),
    "screen:analyze hides overlay before capture when captureUnderlying is set",
  );
  check(
    cssSelectorRuleContains(
      overlayCss,
      ".specter-hud-shell",
      /pointer-events:\s*none/,
    ),
    "HUD shell does not block clicks in invisible surrounding space",
  );
  for (const selector of [
    ".specter-hud-drag-handle",
    ".specter-workflow-card",
    ".mode-toggle",
    ".input-bar",
    ".session-panel",
    ".specter-debug-toggle",
    ".specter-debug-tools",
    ".specter-hud-shell button",
    ".specter-hud-shell input",
  ]) {
    check(
      cssSelectorRuleContains(overlayCss, selector, /pointer-events:\s*auto/),
      `${selector} remains clickable inside the inert HUD shell`,
    );
  }

  printHeader("Walkthrough vs Auto");

  const cursor = readFile("src/main/cursor.ts");
  const replay = readFile("src/main/session/replay.ts");
  const replayAuto = readFile("src/main/session/replayAuto.ts");
  const replaySafety = readFile("src/main/session/replaySafety.ts");
  const userCursor = readFile("src/main/userCursor.ts");
  const walkthroughBody = exportedFunctionBody(
    replay,
    "replayWalkthrough",
    "registerReplayIpc",
  );
  const autoBody = exportedFunctionBody(replayAuto, "replayAutoExecute");
  const realCursorImportPattern =
    /from\s+['"]\.\.\/cursor['"]|from\s+['"]\.\/cursor['"]/;
  const replayModulesWithCursorImport = [
    ["src/main/session/replay.ts", replay],
    ["src/main/session/replayAuto.ts", replayAuto],
    ["src/main/session/replayController.ts", replayController],
  ]
    .filter(([, source]) => realCursorImportPattern.test(source))
    .map(([file]) => file);

  check(
    cursor.includes("moveRealMouse") && cursor.includes("clickRealMouse"),
    "real mouse automation has explicit real-mouse names",
  );
  check(
    !cursor.includes("ghostMove") && !cursor.includes("ghostClick"),
    "real cursor module no longer exports ghostMove/ghostClick names",
  );
  check(
    !realCursorImportPattern.test(replay),
    "walkthrough replay module does not import cursor.ts",
  );
  check(
    replayModulesWithCursorImport.length === 1 &&
      replayModulesWithCursorImport[0] === "src/main/session/replayAuto.ts",
    "replayAuto.ts is the only replay module that imports cursor.ts",
  );
  check(
    !/moveRealMouse|clickRealMouse|executeRealMouseSteps|mouse\.move|mouse\.click/.test(
      walkthroughBody,
    ),
    "replayWalkthrough body does not call real mouse automation",
  );
  check(
    !/@nut-tree-fork\/nut-js/.test(replay),
    "walkthrough replay module does not import nut-js",
  );
  check(
    walkthroughBody.includes("emitGhostStep"),
    "replayWalkthrough emits renderer replay step events",
  );
  check(
    walkthroughBody.includes("waitForUserClickOnTarget"),
    "click walkthrough steps require user click completion",
  );
  check(
    /\} else if \(step\.action === ['"]click['"]\)/.test(walkthroughBody) &&
      walkthroughBody.includes(
        "result = await waitForUserClickOnTarget(step, controller)",
      ),
    "click walkthrough steps arm click detection before hover-only waits",
  );
  check(
    /step\.action === ['"]wait['"]/.test(walkthroughBody) &&
      walkthroughBody.includes("stepWaitMs"),
    "wait steps sleep and continue",
  );
  check(
    !walkthroughBody.includes("45000"),
    "walkthrough no longer uses 45 second per-step waits",
  );
  check(
    walkthroughBody.includes("MAX_WALKTHROUGH_ATTEMPTS"),
    "walkthrough has max attempt protection",
  );
  check(
    autoBody.includes("clickRealMouse") &&
      autoBody.includes("executeRealMouseSteps"),
    "replayAutoExecute calls real mouse automation",
  );
  check(
    overlayAppBody.includes('confirmAutomationGate("auto"'),
    "auto replay arms AutomationGate after user confirmation",
  );
  check(
    autoBody.includes("[AUTO_REAL_MOUSE]"),
    "auto replay logs real OS automation loudly",
  );
  check(
    replay.includes("[WALKTHROUGH]") && replay.includes("[GHOST]"),
    "walkthrough replay has walkthrough and ghost logs",
  );
  check(
    replay.includes("[USER_CURSOR]") && replay.includes("[CLICK_DETECT]"),
    "walkthrough replay has user cursor and click detection logs",
  );
  check(
    replaySafety.includes("assertWalkthroughReplaySafety") &&
      replaySafety.includes("DEV SAFETY GUARD"),
    "development safety guard checks walkthrough real-mouse imports/calls",
  );
  check(
    userCursor.includes("waitForUserClickAtTarget") &&
      /uIOhook\.on\(['"]click['"]/.test(userCursor),
    "user cursor module can wait for an actual user click at target",
  );

  printHeader("AI Config Safety");

  const config = readFile("src/main/ai/config.ts");
  check(fileExists("src/main/ai/config.ts"), "src/main/ai/config.ts exists");
  check(
    config.includes("export function createAnthropicClient"),
    "config.ts exports createAnthropicClient",
  );
  check(config.includes("getUseLocalModel"), "config.ts reads USE_LOCAL_MODEL");
  check(
    config.includes("USE_LOCAL_MODEL === 'true'") ||
      config.includes('USE_LOCAL_MODEL === "true"'),
    'config.ts uses strict "true" check for USE_LOCAL_MODEL',
  );
  check(config.includes("isLocalhostUrl"), "config.ts has localhost URL guard");
  check(
    config.includes(
      "OFFICIAL_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'",
    ) ||
      config.includes(
        'OFFICIAL_ANTHROPIC_BASE_URL = "https://api.anthropic.com"',
      ),
    "config.ts explicitly forces official Anthropic baseURL in non-local mode",
  );
  check(
    /getLocalModelBaseUrl\(\)[\s\S]*?USE_LOCAL_MODEL (===|!==) ['"]true['"]/.test(
      config,
    ),
    'config.ts gates getLocalModelBaseUrl behind USE_LOCAL_MODEL === "true"',
  );
  check(
    !config.includes("console.log") &&
      !config.includes("console.warn") &&
      !config.includes("console.error"),
    "config.ts does not use raw console.log/console.warn/console.error",
  );
  check(
    config.includes("classifyAnthropicError"),
    "config.ts classifies Anthropic failures into safe categories",
  );

  printHeader("AI Backend Health");

  const health = readFile("src/main/ai/health.ts");
  check(
    /['"]ai:healthCheck['"]/.test(mainIndex),
    "index.ts registers ai:healthCheck IPC",
  );
  check(
    preloadBody.includes("checkAIBackend") &&
      preloadBody.includes("ai:healthCheck"),
    "preload exposes checkAIBackend without exposing keys",
  );
  check(
    overlayAppBody.includes("Check Voice Backend"),
    "Debug UI exposes Check Voice Backend",
  );
  check(
    overlayAppBody.includes("Test Voice Output"),
    "Debug UI exposes Test Voice Output",
  );
  check(
    health.includes("keyLength") && health.includes("placeholderDetected"),
    "AI health reports key length and placeholder status",
  );
  check(
    !/slice\s*\(/.test(health),
    "AI health does not expose API key prefixes",
  );
  check(
    !/console\.(log|warn|error)/.test(health),
    "AI health uses safe logging only",
  );
  check(
    health.includes("Return OK") && health.includes("max_tokens: 8"),
    "AI health uses a tiny text-only Anthropic test request",
  );
  check(
    health.includes("OPENAI_API_KEY") && health.includes("whisperConfigured"),
    "AI health reports OpenAI Whisper configuration",
  );
  check(
    health.includes("ELEVENLABS_API_KEY") &&
      health.includes("ElevenLabsHealth"),
    "AI health reports ElevenLabs configuration",
  );
  check(
    health.includes("openaiTTS") && health.includes("OpenAITTSHealth"),
    "AI health reports OpenAI TTS configuration",
  );
  check(
    health.includes("readyForNaturalVoiceOutput") &&
      (health.includes("elevenlabs.configured") ||
        health.includes("openaiTTS.configured")),
    "AI health marks natural voice ready if either provider is available",
  );

  printHeader("Context Tracking + Proactive Prediction");

  check(
    fileExists("src/main/context/contextTracker.ts"),
    "contextTracker.ts exists",
  );
  check(
    fileExists("src/main/context/proactivePrediction.ts"),
    "proactivePrediction.ts exists",
  );
  check(
    fileExists("src/main/context/typedContextBuffer.ts"),
    "typedContextBuffer.ts exists",
  );
  check(
    fileExists("src/main/context/clipboardContext.ts"),
    "clipboardContext.ts exists",
  );
  check(
    fileExists("src/main/context/browserUrlProbe.ts"),
    "browserUrlProbe.ts exists",
  );
  check(
    fileExists("src/main/context/contextStorage.ts"),
    "contextStorage.ts exists",
  );
  check(
    fileExists("resources/ambient-listener.html"),
    "ambient-listener.html exists",
  );
  check(
    mainIndex.includes("startContextTracking") &&
      mainIndex.includes("buildProactivePrediction") &&
      mainIndex.includes('ipcMain.handle("proactive:predict"'),
    "index.ts wires context tracking and proactive prediction IPC",
  );
  check(
    preloadBody.includes("getProactivePrediction") &&
      preloadBody.includes("getContextSnapshot"),
    "overlay preload exposes proactive/context APIs",
  );
  check(
    overlayAppBody.includes("getProactivePrediction"),
    "OverlayApp calls proactive prediction on summon",
  );

  printHeader("Logger Safety");

  check(fileExists("src/main/logger.ts"), "src/main/logger.ts exists");
  const logger = readFile("src/main/logger.ts");
  check(
    logger.includes("export function safeLog"),
    "logger.ts exports safeLog",
  );
  check(
    logger.includes("export function safeWarn"),
    "logger.ts exports safeWarn",
  );
  check(
    logger.includes("export function safeError"),
    "logger.ts exports safeError",
  );
  check(
    logger.includes("REDACTED") && logger.includes("OPENAI_API_KEY"),
    "logger redacts secret-shaped values before printing",
  );
  check(
    logger.includes("NVIDIA_API_KEY") && logger.includes("nvapi-"),
    "logger explicitly redacts NVIDIA API keys",
  );
  check(
    /from ['"](\.\/|\.\.\/)logger['"]/.test(mainIndex),
    "index.ts imports safe logger",
  );
  check(
    mainIndex.includes("safeLog") &&
      mainIndex.includes("safeWarn") &&
      mainIndex.includes("safeError"),
    "index.ts uses safeLog/safeWarn/safeError",
  );
  check(
    mainIndex.includes("isBrokenPipeError"),
    "index.ts defines isBrokenPipeError",
  );
  check(
    /code === ['"]EPIPE['"]/.test(mainIndex),
    "isBrokenPipeError checks for EPIPE code",
  );
  check(
    /process\.on\(['"]uncaughtException['"]/.test(mainIndex) &&
      mainIndex.includes("isBrokenPipeError"),
    "index.ts guards uncaughtException against EPIPE",
  );
  check(
    mainIndex.includes("function safeSend("),
    "index.ts has safeSend utility for IPC",
  );
  check(
    mainIndex.includes("safeSend(overlayWindow"),
    "index.ts uses safeSend for overlay events",
  );
  const tts = readFile("src/main/ai/tts.ts");
  check(tts.includes("speakOpenAI"), "TTS has OpenAI fallback logic");
  check(
    tts.includes("SpeakResult") && tts.includes("providerUsed"),
    "TTS returns provider details",
  );
  check(
    tts.includes("[TTS] speak called") &&
      tts.includes("[TTS] ElevenLabs failed"),
    "TTS logs speak attempts and safe fallback errors",
  );
  check(
    tts.includes("using macOS fallback") && tts.includes("safeLog"),
    "TTS clearly logs when falling back to macOS say",
  );
  check(
    tts.includes("ELEVENLABS_VOICE_ID") && tts.includes("ELEVENLABS_MODEL_ID"),
    "TTS supports custom ElevenLabs voice and model IDs",
  );

  printHeader("Window Routing");

  const screenCoordinates = readFile("src/main/screenCoordinates.ts");
  const capture = readFile("src/main/capture.ts");
  const stressChecklist = readFile("docs/manual-stress-test-checklist.md");
  const toScreenPointBody = screenCoordinates.slice(
    screenCoordinates.indexOf("export async function toScreenPoint"),
    screenCoordinates.indexOf("export function screenPointToPercent"),
  );
  const screenPointToPercentBody = screenCoordinates.slice(
    screenCoordinates.indexOf("export function screenPointToPercent"),
    screenCoordinates.indexOf("export function logicalPointToPercent"),
  );

  check(
    mainIndex.includes("[WINDOW_ROUTING] overlay summon request"),
    "double-shift summon logs window routing request",
  );
  check(
    mainIndex.includes("screen.getCursorScreenPoint()"),
    "double-shift routing samples the current cursor point",
  );
  check(
    mainIndex.includes("screen.getDisplayNearestPoint"),
    "double-shift routing selects the nearest active display",
  );
  check(
    mainIndex.includes(
      "setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })",
    ),
    "overlay is visible on all workspaces and fullscreen spaces",
  );
  check(
    mainIndex.includes("setFullScreenable(false)"),
    "overlay uses non-fullscreenable macOS auxiliary behavior",
  );
  check(
    mainIndex.includes("showInactive()"),
    "overlay summon can show without stealing active-app focus",
  );
  check(
    mainIndex.includes("setContentBounds"),
    "practice window is centered on the routed display",
  );
  check(
    mainIndex.includes("[STRESS_TEST]"),
    "main process has stress-test lifecycle logs",
  );
  check(
    mainIndex.includes("SPECTER_OPEN_DEVTOOLS"),
    "devtools are opt-in for cleaner demo flow",
  );
  check(
    screenCoordinates.includes("setActiveCoordinateDisplay") ||
      screenCoordinates.includes("getActiveCoordinateDisplay"),
    "coordinate conversion tracks the routed active display",
  );
  check(
    screenCoordinates.includes(
      "COORDINATE_MODE = 'electron logical display bounds'",
    ) ||
      screenCoordinates.includes(
        'COORDINATE_MODE = "electron logical display bounds"',
      ),
    "coordinate mode says electron logical display bounds",
  );
  check(
    toScreenPointBody.includes("display.bounds.width") &&
      toScreenPointBody.includes("display.bounds.height"),
    "toScreenPoint maps percent into active display bounds",
  );
  check(
    !/logical[XY]\s*\*\s*(scale|display\.scaleFactor)|display\.bounds\.\w+\s*\*\s*display\.scaleFactor/.test(
      toScreenPointBody,
    ),
    "toScreenPoint does not multiply percent coordinates by scaleFactor",
  );
  check(
    !screenCoordinates.includes("physicalBoundsForDisplay"),
    "screenCoordinates no longer uses physicalBoundsForDisplay for default percent mapping",
  );
  check(
    screenPointToPercentBody.includes("display.bounds"),
    "screenPointToPercent uses the same logical display bounds",
  );
  check(
    capture.includes("getActiveCoordinateDisplay"),
    "screen capture follows the routed active display",
  );
  check(
    stressChecklist.includes("## A. Overlay Toggling") &&
      stressChecklist.includes("## H. Window Lifecycle"),
    "manual stress-test checklist covers A through H",
  );

  printHeader("Capture Log Naming");

  const analyzeBody = exportedFunctionBody(mainIndex, "screen:analyze");
  check(
    mainIndex.includes("[CAPTURE_SCREEN]"),
    "index.ts uses [CAPTURE_SCREEN] prefix when captureUnderlying is false",
  );
  check(
    !/\[CAPTURE_UNDERLYING\][\s\S]*?starting screenshot capture/.test(
      analyzeBody,
    ) || analyzeBody.includes("logPrefix"),
    "screen:analyze does not unconditionally log [CAPTURE_UNDERLYING]",
  );

  printHeader("Passive Overlay Behavior");

  check(
    !overlayAppBody.includes("api.analyzeScreen()") ||
      !/useEffect\(\s*\(\)\s*=>\s*{[\s\S]*?api\.analyzeScreen\(\)/.test(
        overlayAppBody,
      ),
    "OverlayApp does not unconditionally call api.analyzeScreen() inside a useEffect tied to isVisible",
  );
  check(
    !/api\.onReplayStep\s*\([\s\S]{1,200}?mode\s*===\s*["']ultra["']/.test(
      overlayAppBody,
    ),
    'OverlayApp does not read mode === "ultra" directly inside useEffect() replay listeners',
  );
  check(
    overlayAppBody.includes("modeRef = useRef(mode)"),
    "OverlayApp contains modeRef",
  );

  printHeader("Ultra Mode");

  check(
    overlayAppBody.includes("speakIfUltra") &&
      overlayAppBody.includes('currentMode === "ultra"'),
    "renderer gates speech on ultra mode",
  );
  check(
    overlayAppBody.includes("[ULTRA] skipped because silent mode"),
    "renderer logs silent skips",
  );
  check(
    overlayAppBody.includes("mode,") &&
      mainIndex.includes("[MODE] current mode"),
    "real-app flow passes and logs current mode",
  );
  check(
    readFile("src/main/ai/tts.ts").includes("[TTS] speak called"),
    "TTS speak path logs speak calls",
  );
  check(
    plannerBody.includes("export async function ultraConverse"),
    "planner exports ultraConverse",
  );
  check(
    /ipcMain\.handle\(['"]ultra:converse['"]/.test(mainIndex),
    "index.ts registers ultra:converse IPC",
  );
  check(
    preloadBody.includes("ultraConverse:"),
    "preload exposes ultraConverse",
  );
  check(
    fileExists("src/renderer/overlay/UltraReplyBubble.tsx"),
    "UltraReplyBubble component exists",
  );
  check(
    overlayAppBody.includes("handleUltraSpokenInput") &&
      overlayAppBody.includes("ultraState"),
    "OverlayApp has handleUltraSpokenInput and ultraState",
  );
  check(
    overlayAppBody.includes("conversationState={ultraState}") &&
      /conversationState === ['"]thinking['"]/.test(
        readFile("src/renderer/overlay/VoiceMicButton.tsx"),
      ) &&
      /conversationState === ['"]speaking['"]/.test(
        readFile("src/renderer/overlay/VoiceMicButton.tsx"),
      ),
    "voice dock shows ultra state visibility (thinking/speaking pill)",
  );
  check(
    overlayAppBody.includes("setTimeout") &&
      overlayAppBody.includes("converse timeout"),
    "Ultra has hard timeouts for conversation",
  );
  check(
    overlayAppBody.includes("[ULTRA] user said") &&
      overlayAppBody.includes("[ULTRA] tutor reply"),
    "OverlayApp logs user said and tutor reply",
  );
  check(
    inputBarBody.includes('mode === "ultra" && onUltraSpokenInput'),
    "InputBar auto-sends to tutor in Ultra mode",
  );
  check(
    plannerBody.includes("fallbackUltraReply"),
    "ultraConverse provides fallback replies",
  );

  printHeader("Live Ghost / AX Resolver");

  const liveResolverBody = readFile(
    "src/main/automation/liveTargetResolver.ts",
  );
  const ghostActionPlayerBody = readFile(
    "src/renderer/overlay/GhostActionPlayer.tsx",
  );
  const useGhostTravelBody = readFile("src/renderer/overlay/useGhostTravel.ts");

  check(
    fileExists("src/main/automation/liveTargetResolver.ts"),
    "liveTargetResolver module exists",
  );
  check(
    liveResolverBody.includes("export async function listVisibleAxLabels"),
    "liveTargetResolver exports listVisibleAxLabels",
  );
  check(
    liveResolverBody.includes("export function isLabelResolvableInVisibleSet"),
    "liveTargetResolver exports isLabelResolvableInVisibleSet",
  );
  check(
    liveResolverBody.includes("AX_DUMP_TIMEOUT_MS = 800"),
    "liveTargetResolver uses 800ms AX dump timeout",
  );
  check(
    readFile("resources/native/ax-dump.swift").includes(
      "AXManualAccessibility",
    ),
    "ax-dump.swift forces Electron/Chromium full AX tree",
  );
  check(
    mainIndex.includes('"live:resolveTarget"'),
    "index.ts registers live:resolveTarget IPC",
  );
  check(
    mainIndex.includes("listVisibleAxLabels") &&
      mainIndex.includes("liveTargetUnresolved"),
    "ultra:converse enriches AX labels and strips unresolvable liveTarget",
  );
  check(
    preloadBody.includes('"live:resolveTarget"') ||
      preloadBody.includes("'live:resolveTarget'"),
    "preload invokes live:resolveTarget",
  );
  check(
    plannerBody.includes("visibleAxLabels") &&
      plannerBody.includes("liveTargetUnresolved"),
    "planner constrains liveTarget to visible AX labels",
  );
  check(
    plannerBody.includes("export function parseUltraLiveTarget"),
    "planner exports parseUltraLiveTarget for validation",
  );
  check(
    overlayAppBody.includes("applyLiveTargetFromResult") &&
      overlayAppBody.includes("liveTargetUnresolved") &&
      overlayAppBody.includes("[LIVE_GHOST]"),
    "OverlayApp surfaces live ghost resolve failures to the user",
  );
  check(
    ghostActionPlayerBody.includes("useGhostTravel") &&
      ghostActionPlayerBody.includes("openui-ghost-cursor-host--trail"),
    "GhostActionPlayer uses travel animation hook and OpenUI trail styling",
  );
  check(
    useGhostTravelBody.includes('phase === "travel"') &&
      ghostActionPlayerBody.includes("loop: false"),
    "live ghost uses single-shot useGhostTravel travel via GhostActionPlayer",
  );
  check(
    readFile("src/main/memorySidecar.ts").includes("GHOSTWIKI_WIKI_ROOT"),
    "memory sidecar passes GHOSTWIKI_WIKI_ROOT into Python env",
  );
  check(
    mainIndex.includes("wikiRoot") && mainIndex.includes("configuredWikiRoot"),
    "ghostwiki:health reports wiki root alignment",
  );
  check(
    fileExists("scripts/test-live-target-resolver-runtime.ts"),
    "runtime AX resolver probe script exists",
  );
  const replayAutoBody = readFile("src/main/session/replayAuto.ts");
  check(
    replayAutoBody.includes("CLINICAL_SAFETY_FILTER") &&
      readFile(".env.example").includes("CLINICAL_SAFETY_FILTER"),
    "clinical safety gate is env-flagged and documented",
  );

  printHeader("AI Backend Fallback Safety");

  check(
    screenerBody.includes("analyzeVision"),
    "screener uses analyzeVision for multi-provider support",
  );
  check(
    plannerBody.includes("AI_BACKEND_UNAVAILABLE") ||
      plannerBody.includes("UNKNOWN_VISION_ERROR"),
    "planner handles vision errors",
  );
  check(
    screenerBody.includes("[AI_BACKEND] Vision provider failed"),
    "screener logs vision provider failures",
  );
  check(
    plannerBody.includes("[AI_BACKEND] Anthropic unavailable; using fallback"),
    "planner logs AI_BACKEND fallback",
  );

  printHeader("Session Normalization");

  const storage = readFile("src/main/session/storage.ts");
  const recorder = readFile("src/main/session/recorder.ts");
  check(
    storage.includes("instruction") && storage.includes("targetLabel"),
    "stored session steps preserve instructional labels",
  );
  check(
    storage.includes("waitForMs"),
    "stored session steps preserve waitForMs",
  );
  check(recorder.includes("waitForMs"), "recorded steps preserve waitForMs");

  printHeader("Mirror Mode / Spec");

  const behavioralTypes = readFile("src/main/session/types.ts");
  const behavioralModel = readFile("src/main/behavioral/model.ts");
  const behavioralTracker = readFile("src/main/behavioral/tracker.ts");
  const mirrorReplay = readFile("src/main/session/mirrorReplay.ts");
  const specBuddy = readFile("src/renderer/overlay/SpecBuddy.tsx");
  const realityLock = readFile("docs/reality-lock.md");
  const mirrorRunBody = mainIndex.slice(
    mainIndex.indexOf('"mirror:run"'),
    mainIndex.indexOf('ipcMain.handle("tts:speak"'),
  );

  check(
    behavioralTypes.includes("export interface BehavioralState"),
    "session/types.ts exports BehavioralState",
  );
  check(
    behavioralTypes.includes("export interface BehavioralCheckpoint"),
    "session/types.ts exports BehavioralCheckpoint",
  );
  check(
    behavioralTypes.includes(
      "behavioralCheckpoints?: Record<string, BehavioralCheckpoint>",
    ),
    "LearningGraph includes behavioralCheckpoints",
  );
  check(
    storage.includes("normalizeBehavioralCheckpoint") &&
      storage.includes("currentBehavioralCheckpointId"),
    "storage.ts normalizes behavioralCheckpoints",
  );
  check(
    behavioralModel.includes("export function aggregateBehavioralSignature"),
    "behavioral/model.ts aggregates signatures",
  );
  check(
    behavioralModel.includes("export function blendBehavioralStates"),
    "behavioral/model.ts blends states",
  );
  check(
    behavioralModel.includes("export function diffBehavioralCheckpoints"),
    "behavioral/model.ts diffs checkpoints",
  );
  check(
    behavioralTracker.includes("isRepeatedClick") &&
      /['"]pause['"]/.test(behavioralTracker),
    "tracker.ts records repeated clicks and hesitation frames",
  );
  check(
    behavioralTracker.includes("recordAppSwitchFrame") &&
      behavioralTracker.includes("recordReplayBehavioralEvent"),
    "tracker.ts records app switches and replay events",
  );
  check(
    behavioralTracker.includes("recordBehavioralFeedback") &&
      behavioralTracker.includes("rewardFromFeedback"),
    "tracker.ts derives reward from real feedback",
  );
  check(
    behavioralTracker.includes("synthetic: true") &&
      behavioralTracker.includes("DEV FALLBACK"),
    "tracker.ts labels synthetic fallback checkpoints",
  );
  check(
    behavioralTracker.includes("realFrames.length === 0") &&
      behavioralTracker.includes(
        "Create Checkpoint needs measured behavioral frames",
      ),
    "tracker.ts refuses checkpoints without real frames",
  );
  check(
    behavioralTracker.includes("getMousePercent"),
    "tracker.ts uses safe cursor percent snapshots",
  );
  check(
    mainIndex.includes("setBehavioralStateEmitter") &&
      /sendOverlayEvent\(['"]spec:state['"]/.test(mainIndex),
    "index.ts streams measured behavioral state to Spec",
  );
  check(
    /ipcMain\.handle\(\s*['"]behavior:getState['"]/.test(mainIndex),
    "index.ts registers behavior:getState IPC",
  );
  check(
    !/ipcMain\.handle\(\s*['"]behavior:seedDemo['"]/.test(mainIndex),
    "index.ts does NOT register behavior:seedDemo IPC (demo removed)",
  );
  check(
    /ipcMain\.handle\(\s*['"]behavior:feedback['"]/.test(mainIndex),
    "index.ts registers real feedback IPC",
  );
  check(
    /ipcMain\.handle\(\s*['"]mirror:run['"]/.test(mainIndex),
    "index.ts registers mirror:run IPC",
  );
  check(
    /ipcMain\.handle\("automation:request", async \(event, mode, steps\) => \{[\s\S]*?validateSender\(event, overlayWindow\)[\s\S]*?requestAutomationSession\(mode, steps\)/.test(
      mainIndex,
    ),
    "automation:request validates that IPC came from the overlay window",
  );
  check(
    /ipcMain\.handle\("automation:confirm", async \(event, token\) => \{[\s\S]*?validateSender\(event, overlayWindow\)[\s\S]*?confirmAutomationSession\(token\)/.test(
      mainIndex,
    ),
    "automation:confirm validates that IPC came from the overlay window",
  );
  check(
    mirrorRunBody.includes("validateSender(event, overlayWindow)"),
    "mirror:run validates that IPC came from the overlay window",
  );
  check(
    overlayAppBody.includes('confirmAutomationGate("mirror"'),
    "Mirror Mode arms AutomationGate after user confirmation",
  );
  check(
    mirrorRunBody.includes(
      'validateAutomationAction("mirror:run", steps.length)',
    ),
    "mirror:run requires AutomationGate before real mouse automation",
  );
  check(
    !mainIndex.includes("Synthetic demo checkpoints are a dev-only fallback") &&
      !mainIndex.includes("SPECTER_ENABLE_DEV_FALLBACK"),
    "index.ts no longer gates synthetic demo data (demo removed)",
  );
  check(
    !/ipcMain\.handle\('mirror:run'[\s\S]*?seedDemoCheckpoints/.test(mainIndex),
    "Mirror Mode does not seed demo checkpoints in its main path",
  );
  check(
    !/ipcMain\.handle\('mirror:run'[\s\S]*?ensureControlledDemoWorkflow/.test(
      mainIndex,
    ),
    "Mirror Mode does not fall back to the controlled demo",
  );
  check(
    mainIndex.includes("Mirror Mode needs measured behavioral frames") &&
      mainIndex.includes("Mirror Mode needs a real recorded or saved workflow"),
    "Mirror Mode refuses to run without real behavior and real workflow data",
  );
  check(
    preloadBody.includes("behaviorGetState") &&
      preloadBody.includes("behaviorRecordFeedback"),
    "preload exposes behavioral IPC helpers",
  );
  check(
    preloadBody.includes("runMirrorMode") &&
      preloadBody.includes("onSpecState"),
    "preload exposes Mirror Mode and Spec events",
  );
  check(
    plannerBody.includes("export async function planWithPersona"),
    "planner.ts exports planWithPersona",
  );
  check(
    mirrorReplay.includes("durationForPersona") &&
      mirrorReplay.includes("mirrorReplayExecute"),
    "mirrorReplay includes persona-conditioned timing",
  );
  check(
    specBuddy.includes("spec-buddy--") &&
      specBuddy.includes("judging your click"),
    "SpecBuddy renders mood classes and labels",
  );
  check(
    specBuddy.includes("measured behavior") &&
      specBuddy.includes("feedback reward"),
    "SpecBuddy uses measured pitch labels",
  );
  for (const mood of [
    "idle",
    "thinking",
    "stuck",
    "flow",
    "celebrating",
    "mirroring",
    "judging",
  ]) {
    check(
      overlayCss.includes(`spec-buddy--${mood}`),
      `overlay.css includes spec-buddy--${mood}`,
    );
  }
  check(overlayAppBody.includes("<SpecBuddy"), "OverlayApp renders SpecBuddy");
  check(
    overlayAppBody.includes("Mirror Mode"),
    "OverlayApp exposes Mirror Mode controls",
  );
  check(
    overlayAppBody.includes("behaviorBlendCheckpoints") &&
      overlayAppBody.includes("behaviorDiffCheckpoints"),
    "OverlayApp exposes checkpoint blend and diff controls",
  );
  check(
    overlayAppBody.includes("submitMirrorFeedback") &&
      overlayAppBody.includes("behaviorRecordFeedback"),
    "OverlayApp sends accept/override/hesitation/correction feedback",
  );
  check(
    overlayAppBody.includes("Pitch Mode") &&
      overlayAppBody.includes("What changed?"),
    "OverlayApp exposes Pitch Mode and final diff card",
  );
  check(
    overlayAppBody.includes("event.key.toLowerCase()") &&
      overlayAppBody.includes("createBehaviorCheckpoint"),
    "OverlayApp includes dev checkpoint shortcuts",
  );
  check(
    !overlayAppBody.includes('if (key === "j") setSpecMood'),
    "OverlayApp does not hardcode dev mood shortcuts",
  );
  check(
    realityLock.includes("Spec can be funny, but the system cannot be fake."),
    "Reality Lock documents the non-fake product rule",
  );
  check(
    realityLock.includes("measured, not magic"),
    "Reality Lock pitch language says measured, not magic",
  );

  printHeader("Runtime Unit Tests");

  try {
    const gatePath = path.resolve(root, "src/main/security/automationGate.ts");
    if (fs.existsSync(gatePath)) {
      const gate = await import(gatePath);
      gate.cancelAutomationSession();
      check(
        !gate.validateAutomationAction("test"),
        "AutomationGate blocks action when no session exists",
      );
      const token = gate.requestAutomationSession("auto", 10);
      check(
        !gate.validateAutomationAction("test"),
        "AutomationGate blocks action when session not confirmed",
      );
      check(
        gate.confirmAutomationSession(token),
        "AutomationGate accepts valid confirmation",
      );
      check(
        gate.validateAutomationAction("test", 5),
        "AutomationGate allows action when confirmed",
      );
      check(
        !gate.validateAutomationAction("test", 10),
        "AutomationGate blocks action when step limit exceeded",
      );
      gate.cancelAutomationSession();
    } else {
      report("fail", "automationGate.ts is missing");
    }
  } catch (err) {
    report("fail", "AutomationGate tests failed: " + err);
  }

  try {
    const { spawnSync } = await import("child_process");
    const unitProbe = spawnSync(
      "npx",
      ["ts-node", "--transpile-only", "scripts/test-live-ghost-unit.ts"],
      { cwd: root, encoding: "utf-8", timeout: 30_000 },
    );
    const unitOutput = `${unitProbe.stdout || ""}${unitProbe.stderr || ""}`;
    check(
      unitProbe.status === 0 &&
        unitOutput.includes("All live-ghost unit tests passed"),
      "live ghost parser/resolver unit tests pass",
    );
    if (unitProbe.status !== 0) {
      console.log(unitOutput.trim());
    }
  } catch (err) {
    report("fail", "Live ghost parser/resolver unit tests failed: " + err);
  }

  try {
    const roamPath = path.resolve(
      root,
      "src/renderer/overlay/usePerimeterRoam.ts",
    );
    if (fs.existsSync(roamPath)) {
      const roam = await import(roamPath);
      const rect = {
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        width: 1000,
        height: 800,
      } as DOMRect;
      const result = roam.mapOffsetToPerimeterPoint(0, rect, 56, 12, 16, true);
      check(
        result.x >= 40 && result.y >= 44,
        "Ghost geometry never returns interior points (safe margin applied)",
      );
      check(
        result.totalLen > 0,
        "Ghost geometry calculates positive perimeter length",
      );
    } else {
      report("fail", "usePerimeterRoam.ts is missing");
    }
  } catch (err) {
    report("fail", "Ghost geometry tests failed: " + err);
  }

  const total = passed + failed;
  console.log("\n" + chalk.bold("-".repeat(48)));
  console.log(chalk.bold(`${passed}/${total} automated checks passed`));
  if (warned > 0) {
    console.log(
      chalk.yellow.bold(
        `${warned} warning(s); demo may need local secrets or permissions`,
      ),
    );
  }
  if (failed > 0) {
    console.log(chalk.red.bold(`${failed} automated check(s) failed`));
    process.exit(1);
  }
  console.log(chalk.green.bold("All Specter health checks passed"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
