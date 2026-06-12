/**
 * Adversarial stress tests for the split-screen module.
 *
 * Run: npx ts-node scripts/test-splitscreen.ts
 *
 * These tests deliberately try to break the AppleScript builders and parsers
 * with hostile/garbage input: injection-shaped pids, NaN/Infinity frames,
 * malformed osascript output, double-restore, and tiny displays. None of
 * them touch osascript itself, so they run anywhere.
 */

import {
  buildSplitScript,
  buildRestoreScript,
  parseSplitResult,
  computeAppFrame,
  isValidPid,
  SPLIT_RAIL_WIDTH,
  __resetSplitScreenStateForTests,
} from "../src/main/automation/splitScreen";

async function main() {
  const { default: chalk } = await import("chalk");

  let passed = 0;
  let failed = 0;

  function check(condition: boolean, msg: string) {
    if (condition) {
      passed++;
      console.log(chalk.green.bold("PASS") + " " + msg);
    } else {
      failed++;
      console.log(chalk.red.bold("FAIL") + " " + msg);
    }
  }

  function printHeader(title: string) {
    console.log("\n" + chalk.cyan.bold("== " + title + " =="));
  }

  function throws(fn: () => unknown): boolean {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  }

  __resetSplitScreenStateForTests();

  // ── pid validation: the AppleScript injection barrier ──
  printHeader("pid validation (injection barrier)");
  check(isValidPid(1234), "accepts a normal pid");
  check(!isValidPid(0), "rejects pid 0");
  check(!isValidPid(-5), "rejects negative pid");
  check(!isValidPid(3.14), "rejects fractional pid");
  check(!isValidPid(NaN), "rejects NaN pid");
  check(!isValidPid(Infinity), "rejects Infinity pid");
  check(!isValidPid(99_999_999), "rejects absurdly large pid");
  check(
    !isValidPid('123" & (do shell script "id") & "' as unknown),
    "rejects string-shaped injection payload",
  );
  check(!isValidPid(null), "rejects null");
  check(!isValidPid(undefined), "rejects undefined");

  // ── script builders refuse bad pids outright ──
  printHeader("script builders");
  const frame = { x: 0, y: 25, width: 1100, height: 870 };
  check(
    throws(() => buildSplitScript(-1 as number, frame)),
    "buildSplitScript throws on invalid pid",
  );
  check(
    throws(() => buildSplitScript("666; rm -rf /" as unknown as number, frame)),
    "buildSplitScript throws on injection-shaped pid",
  );
  check(
    throws(() => buildRestoreScript(NaN as number, frame, false)),
    "buildRestoreScript throws on NaN pid",
  );

  const script = buildSplitScript(4242, frame);
  check(script.includes("unix id is 4242"), "script targets process by pid");
  check(
    script.includes("set position of w to {0, 25}"),
    "script sets integer position",
  );
  check(
    script.includes("set size of w to {1100, 870}"),
    "script sets integer size",
  );
  check(script.includes("AXFullScreen"), "script handles fullscreen exit");
  check(
    script.includes('return "ERR:no-window"'),
    "script guards windowless processes",
  );

  // Hostile frames: floats and weird values must be coerced to ints,
  // never interpolated raw into AppleScript.
  const weird = buildSplitScript(99, {
    x: 10.7,
    y: -0.4,
    width: 1280.49,
    height: 800.5,
  });
  check(
    weird.includes("{11, 0}") && weird.includes("{1280, 801}"),
    "fractional frame values are rounded to integers",
  );
  check(
    !/[{,]\s*(NaN|Infinity|e\+|\.\d)/.test(
      buildSplitScript(99, {
        x: Number.NaN as number,
        y: Infinity as number,
        width: 1000,
        height: 800,
      }),
    ),
    "NaN/Infinity frame values never leak into the script",
  );

  const restoreFs = buildRestoreScript(77, frame, true);
  check(
    restoreFs.includes("AXFullScreen"),
    "restore script re-enters fullscreen when it was fullscreen",
  );
  const restoreNoFs = buildRestoreScript(77, frame, false);
  check(
    !restoreNoFs.includes("AXFullScreen"),
    "restore script leaves fullscreen alone otherwise",
  );

  // ── result parsing: garbage in, structure out ──
  printHeader("result parsing");
  const ok = parseSplitResult("OK:12,25,1512,920,fs=true\n");
  check(
    ok.ok === true &&
      ok.wasFullscreen === true &&
      ok.previousFrame?.x === 12 &&
      ok.previousFrame?.width === 1512,
    "parses a clean OK payload",
  );
  check(
    parseSplitResult("ERR:no-window").ok === false &&
      parseSplitResult("ERR:no-window").reason === "no-window",
    "parses ERR payloads",
  );
  check(parseSplitResult("").ok === false, "rejects empty output");
  check(
    parseSplitResult("execution error: blah (-1719)").ok === false,
    "rejects AppleScript error text",
  );
  check(
    parseSplitResult("OK:garbage,not,numbers,here,fs=false").ok === true &&
      parseSplitResult("OK:garbage,not,numbers,here,fs=false").previousFrame ===
        undefined,
    "OK with corrupt numbers still succeeds but drops the frame",
  );
  check(
    parseSplitResult("OK:1,2,3,4,fs=banana").wasFullscreen === false,
    "non-boolean fs flag defaults to false",
  );
  check(
    parseSplitResult("OK:-100,-50,800,600,fs=false").previousFrame?.x === -100,
    "negative coordinates (multi-display) parse correctly",
  );

  // ── frame computation: tiny and hostile displays ──
  printHeader("frame computation");
  const work = { x: 0, y: 25, width: 1512, height: 945 };
  const computed = computeAppFrame(work);
  check(
    computed !== null && computed.width === 1512 - SPLIT_RAIL_WIDTH,
    "reserves the rail width on a normal display",
  );
  check(
    computeAppFrame({ x: 0, y: 0, width: 700, height: 500 }) === null,
    "refuses to split a display too narrow for a usable app window",
  );
  check(
    computeAppFrame({ x: 0, y: 0, width: 2000, height: 200 }) === null,
    "refuses to split a display too short",
  );
  check(
    computeAppFrame({ x: NaN, y: 0, width: 2000, height: 1000 }) === null,
    "rejects NaN work areas",
  );
  check(
    computeAppFrame({
      x: 0,
      y: 0,
      width: Infinity,
      height: 1000,
    }) === null,
    "rejects Infinity work areas",
  );
  const negRail = computeAppFrame(work, -500);
  check(
    negRail !== null && negRail.width === work.width,
    "negative rail width clamps to zero instead of growing the app",
  );

  // ── module entry points never throw on hostile input ──
  printHeader("runtime guards");
  const { enterSplitScreen, restoreSplitScreen } =
    await import("../src/main/automation/splitScreen");
  const bad = await enterSplitScreen({
    pid: "evil" as unknown as number,
    workArea: work,
  });
  check(
    bad.ok === false && bad.reason === "invalid-pid",
    "enterSplitScreen rejects garbage pid without throwing",
  );
  const tiny = await enterSplitScreen({
    pid: 1234,
    workArea: { x: 0, y: 0, width: 100, height: 100 },
  });
  check(
    tiny.ok === false && tiny.reason === "display-too-small",
    "enterSplitScreen refuses a tiny display without throwing",
  );
  const nothing = await restoreSplitScreen();
  check(
    nothing.ok === false &&
      ["nothing-to-restore", "unsupported-platform"].includes(
        nothing.reason ?? "",
      ),
    "restoreSplitScreen with no active split is a safe no-op",
  );
  const again = await restoreSplitScreen();
  check(
    again.ok === false,
    "double-restore is a safe no-op (no stale state reuse)",
  );

  console.log(
    "\n" +
      (failed === 0
        ? chalk.green.bold(`All ${passed} checks passed`)
        : chalk.red.bold(`${failed} failed, ${passed} passed`)),
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
