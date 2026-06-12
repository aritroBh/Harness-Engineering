import { UiohookKey, type UiohookKeyboardEvent } from "uiohook-napi";

interface TypedPhrase {
  text: string;
  t: number;
}

const KEY_CHARS: Record<number, { normal: string; shift: string }> = {
  [UiohookKey.A]: { normal: "a", shift: "A" },
  [UiohookKey.B]: { normal: "b", shift: "B" },
  [UiohookKey.C]: { normal: "c", shift: "C" },
  [UiohookKey.D]: { normal: "d", shift: "D" },
  [UiohookKey.E]: { normal: "e", shift: "E" },
  [UiohookKey.F]: { normal: "f", shift: "F" },
  [UiohookKey.G]: { normal: "g", shift: "G" },
  [UiohookKey.H]: { normal: "h", shift: "H" },
  [UiohookKey.I]: { normal: "i", shift: "I" },
  [UiohookKey.J]: { normal: "j", shift: "J" },
  [UiohookKey.K]: { normal: "k", shift: "K" },
  [UiohookKey.L]: { normal: "l", shift: "L" },
  [UiohookKey.M]: { normal: "m", shift: "M" },
  [UiohookKey.N]: { normal: "n", shift: "N" },
  [UiohookKey.O]: { normal: "o", shift: "O" },
  [UiohookKey.P]: { normal: "p", shift: "P" },
  [UiohookKey.Q]: { normal: "q", shift: "Q" },
  [UiohookKey.R]: { normal: "r", shift: "R" },
  [UiohookKey.S]: { normal: "s", shift: "S" },
  [UiohookKey.T]: { normal: "t", shift: "T" },
  [UiohookKey.U]: { normal: "u", shift: "U" },
  [UiohookKey.V]: { normal: "v", shift: "V" },
  [UiohookKey.W]: { normal: "w", shift: "W" },
  [UiohookKey.X]: { normal: "x", shift: "X" },
  [UiohookKey.Y]: { normal: "y", shift: "Y" },
  [UiohookKey.Z]: { normal: "z", shift: "Z" },
  [UiohookKey["0"]]: { normal: "0", shift: ")" },
  [UiohookKey["1"]]: { normal: "1", shift: "!" },
  [UiohookKey["2"]]: { normal: "2", shift: "@" },
  [UiohookKey["3"]]: { normal: "3", shift: "#" },
  [UiohookKey["4"]]: { normal: "4", shift: "$" },
  [UiohookKey["5"]]: { normal: "5", shift: "%" },
  [UiohookKey["6"]]: { normal: "6", shift: "^" },
  [UiohookKey["7"]]: { normal: "7", shift: "&" },
  [UiohookKey["8"]]: { normal: "8", shift: "*" },
  [UiohookKey["9"]]: { normal: "9", shift: "(" },
  [UiohookKey.Space]: { normal: " ", shift: " " },
};

let currentBuffer = "";
let recentPhrases: TypedPhrase[] = [];

function commitBuffer(): void {
  const trimmed = currentBuffer.trim();
  if (trimmed.length >= 2) {
    recentPhrases = [
      ...recentPhrases,
      { text: trimmed.slice(0, 300), t: Date.now() },
    ].slice(-20);
  }
  currentBuffer = "";
}

export function recordKeyEvent(event: UiohookKeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  if (event.keycode === UiohookKey.Enter || event.keycode === UiohookKey.Tab) {
    commitBuffer();
    return;
  }

  if (event.keycode === UiohookKey.Backspace) {
    currentBuffer = currentBuffer.slice(0, -1);
    return;
  }

  const mapped = KEY_CHARS[event.keycode];
  if (!mapped) return;

  currentBuffer += event.shiftKey ? mapped.shift : mapped.normal;
  if (currentBuffer.length > 300) {
    currentBuffer = currentBuffer.slice(-300);
  }
}

export function getRecentTypedText(): string | null {
  if (currentBuffer.trim().length >= 2) {
    return currentBuffer.trim().slice(0, 300);
  }
  const last = recentPhrases[recentPhrases.length - 1];
  if (!last) return null;
  if (Date.now() - last.t > 300_000) return null;
  return last.text;
}

export function getTypedPhraseHistory(): TypedPhrase[] {
  return [...recentPhrases];
}
