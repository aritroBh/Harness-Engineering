import * as cp from "child_process";
import * as adapter from "../src/main/automation/peekabooAdapter";

async function runTests() {
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`PASS: ${msg}`);
    } else {
      console.error(`FAIL: ${msg}`);
    }
  }

  // Helper to mock child_process.spawn
  const originalSpawn = cp.spawn;
  function mockSpawn(mockImplementation: any) {
    (cp as any).spawn = mockImplementation;
  }

  function restoreSpawn() {
    (cp as any).spawn = originalSpawn;
  }

  // 1. Non-macOS disabled
  // Mock os.platform to return linux
  const originalPlatform = Object.getOwnPropertyDescriptor(
    require("os"),
    "platform",
  )!;
  Object.defineProperty(require("os"), "platform", { value: () => "linux" });
  let status = await adapter.getPeekabooStatus();
  assert(
    status.enabled === false &&
      status.warning === "Peekaboo is only supported on macOS",
    "Non-macOS disabled",
  );

  let res = await adapter.captureSnapshot();
  assert(
    res.ok === false &&
      res.warnings[0].includes("disabled: non-macOS platform"),
    "Commands disabled on non-macOS",
  );
  Object.defineProperty(require("os"), "platform", originalPlatform); // Restore

  // 2. USE_PEEKABOO=false
  Object.defineProperty(require("os"), "platform", { value: () => "darwin" });
  process.env.USE_PEEKABOO = "false";
  status = await adapter.getPeekabooStatus();
  assert(
    status.enabled === false &&
      status.warning === "Peekaboo is disabled via environment",
    "USE_PEEKABOO=false disabled",
  );

  res = await adapter.captureSnapshot();
  assert(
    res.ok === false && res.warnings[0].includes("disabled via environment"),
    "Commands disabled via env",
  );

  // Reset to Mac + Enabled for the rest
  Object.defineProperty(require("os"), "platform", { value: () => "darwin" });
  process.env.USE_PEEKABOO = "true";

  // 3. Binary missing
  mockSpawn(() => {
    const ee = new (require("events").EventEmitter)();
    ee.stdout = new (require("events").EventEmitter)();
    ee.stderr = new (require("events").EventEmitter)();
    ee.kill = () => {};
    setTimeout(() => ee.emit("error", { code: "ENOENT" }), 10);
    return ee;
  });

  status = await adapter.getPeekabooStatus();
  assert(
    status.available === false &&
      (status.warning || "").includes("binary is missing"),
    "Binary missing handled",
  );

  res = await adapter.captureSnapshot();
  assert(
    res.ok === false && res.warnings[0].includes("missing on PATH"),
    "Binary missing command handled",
  );

  // 4. Valid JSON
  mockSpawn(() => {
    const ee = new (require("events").EventEmitter)();
    ee.stdout = new (require("events").EventEmitter)();
    ee.stderr = new (require("events").EventEmitter)();
    ee.kill = () => {};
    setTimeout(() => {
      ee.stdout.emit("data", '{"ok": true, "id": "123"}');
      ee.emit("close", 0);
    }, 10);
    return ee;
  });

  res = await adapter.captureSnapshot();
  assert(res.ok === true && res.result.id === "123", "Valid JSON parsing");

  // 5. Invalid JSON
  mockSpawn(() => {
    const ee = new (require("events").EventEmitter)();
    ee.stdout = new (require("events").EventEmitter)();
    ee.stderr = new (require("events").EventEmitter)();
    ee.kill = () => {};
    setTimeout(() => {
      ee.stdout.emit("data", '{"ok": true, bad_json');
      ee.emit("close", 0);
    }, 10);
    return ee;
  });

  res = await adapter.captureSnapshot();
  assert(
    res.ok === false &&
      res.warnings[0].includes("Invalid Peekaboo JSON output"),
    "Invalid JSON handled",
  );

  // 6. Timeout
  mockSpawn(() => {
    const ee = new (require("events").EventEmitter)();
    ee.stdout = new (require("events").EventEmitter)();
    ee.stderr = new (require("events").EventEmitter)();
    ee.kill = () => {};
    // Never close or emit data
    return ee;
  });

  process.env.PEEKABOO_TIMEOUT_MS = "100";
  // Re-import to pick up timeout change
  delete require.cache[
    require.resolve("../src/main/automation/peekabooAdapter")
  ];
  const adapter2 = require("../src/main/automation/peekabooAdapter");

  res = await adapter2.captureSnapshot();
  assert(
    res.ok === false && res.warnings[0].includes("timed out after 100ms"),
    "Timeout handled",
  );

  delete process.env.PEEKABOO_TIMEOUT_MS;

  // 7. Nonzero exit
  mockSpawn(() => {
    const ee = new (require("events").EventEmitter)();
    ee.stdout = new (require("events").EventEmitter)();
    ee.stderr = new (require("events").EventEmitter)();
    ee.kill = () => {};
    setTimeout(() => {
      ee.stderr.emit("data", "Some error happened");
      ee.emit("close", 1);
    }, 10);
    return ee;
  });

  res = await adapter.captureSnapshot();
  assert(
    res.ok === false &&
      res.warnings[0].includes("exited with code 1") &&
      res.warnings[1].includes("Some error"),
    "Nonzero exit handled",
  );

  // 8. Command args are arrays, not interpolated strings
  let spawnArgs: string[] = [];
  mockSpawn((_cmd: string, args: string[], options: any) => {
    assert(Array.isArray(args), "Args are passed as an array to spawn");
    assert(options.shell === false, "shell: false is used");
    spawnArgs = args;
    const ee = new (require("events").EventEmitter)();
    ee.stdout = new (require("events").EventEmitter)();
    ee.stderr = new (require("events").EventEmitter)();
    ee.kill = () => {};
    setTimeout(() => {
      ee.stdout.emit("data", "{}");
      ee.emit("close", 0);
    }, 10);
    return ee;
  });

  await adapter.typeText("hello world; rm -rf /");
  assert(
    spawnArgs.includes("hello world; rm -rf /"),
    "Text is passed as a single argument without shell interpretation",
  );

  assert(
    spawnArgs.join(" ") === "type --text hello world; rm -rf / --json",
    "type arguments are correct",
  );

  await adapter.scrollTarget("my-target", "up");
  assert(
    spawnArgs.join(" ") === "scroll --on my-target --direction up --json",
    "scroll arguments are correct",
  );

  await adapter.clickTarget({ kind: "coords", x: 10, y: 20 });
  assert(
    spawnArgs.join(" ") === "click --coords 10,20 --json",
    "click by coords arguments are correct",
  );

  let seeCalled = false;
  mockSpawn((_cmd: string, args: string[]) => {
    spawnArgs = args;
    const ee = new (require("events").EventEmitter)();
    ee.stdout = new (require("events").EventEmitter)();
    ee.stderr = new (require("events").EventEmitter)();
    ee.kill = () => {};
    setTimeout(() => {
      if (args[0] === "see") {
        seeCalled = true;
        ee.stdout.emit("data", '{"ok": true, "snapshotId": "snap-123"}');
      } else {
        ee.stdout.emit("data", '{"ok": true}');
      }
      ee.emit("close", 0);
    }, 10);
    return ee;
  });

  await adapter.clickTarget({
    kind: "element",
    target: "my-btn",
    snapshotId: "snap-abc",
  });
  assert(
    spawnArgs.join(" ") === "click --on my-btn --snapshot snap-abc --json",
    "element + snapshotId arguments are correct",
  );

  await adapter.clickTarget({ kind: "element", target: "my-btn" });
  assert(
    seeCalled &&
      spawnArgs.join(" ") === "click --on my-btn --snapshot snap-123 --json",
    "element without snapshotId calls see --json and then click with snapshot",
  );

  restoreSpawn();
  Object.defineProperty(require("os"), "platform", originalPlatform); // Restore

  console.log(`${passed}/${total} peekabooAdapter tests passed`);
  if (passed !== total) process.exit(1);
}

runTests();
