import { UiohookKey } from "uiohook-napi";
import {
  getRecentTypedText,
  recordKeyEvent,
} from "../src/main/context/typedContextBuffer";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

function pressKey(
  keycode: number,
  opts: { shiftKey?: boolean; ctrlKey?: boolean } = {},
): void {
  recordKeyEvent({
    type: 4,
    time: Date.now(),
    altKey: false,
    ctrlKey: Boolean(opts.ctrlKey),
    metaKey: false,
    shiftKey: Boolean(opts.shiftKey),
    keycode,
  });
}

function typeText(text: string): void {
  for (const char of text) {
    if (char === " ") {
      pressKey(UiohookKey.Space);
      continue;
    }
    const upper = char.toUpperCase();
    const key = UiohookKey[upper as keyof typeof UiohookKey];
    if (typeof key !== "number") continue;
    pressKey(key, { shiftKey: char === upper && /[A-Z]/.test(char) });
  }
  pressKey(UiohookKey.Enter);
}

console.log("== Context module stress test ==");

typeText("cursor hackathon workflow");
const typed = getRecentTypedText();
check("typed buffer captures phrase", typed === "cursor hackathon workflow");

const beforeShortcut = getRecentTypedText();
pressKey(UiohookKey.C, { ctrlKey: true });
check(
  "shortcut keys do not pollute typed buffer",
  getRecentTypedText() === beforeShortcut,
);

check(
  "search hint regex matches Google title",
  /^specter agent memory$/.test(
    "specter agent memory - Google Search".replace(
      /\s+-\s+Google(?:\s+Search)?$/i,
      "",
    ),
  ),
);

check(
  "URL query param parse",
  (() => {
    const url = new URL("https://www.google.com/search?q=specter+agent+memory");
    return url.searchParams.get("q") === "specter agent memory";
  })(),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
