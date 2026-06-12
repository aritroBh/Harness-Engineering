import { clipboard } from "electron";

interface ClipboardEntry {
  text: string;
  t: number;
}

let lastSeen = "";
let recentEntries: ClipboardEntry[] = [];

function looksSensitive(text: string): boolean {
  return /password|ssn|social security|credit.?card|api[_-]?key|secret[_-]?key|bearer\s/i.test(
    text,
  );
}

export function pollClipboard(): string | null {
  try {
    const text = clipboard.readText()?.trim();
    if (!text || text === lastSeen) {
      return getRecentClipboardText();
    }
    if (text.length > 800 || looksSensitive(text)) {
      lastSeen = text;
      return getRecentClipboardText();
    }

    lastSeen = text;
    recentEntries = [
      ...recentEntries,
      { text: text.slice(0, 400), t: Date.now() },
    ].slice(-12);
    return text.slice(0, 400);
  } catch {
    return getRecentClipboardText();
  }
}

export function getRecentClipboardText(): string | null {
  const last = recentEntries[recentEntries.length - 1];
  if (!last) return null;
  if (Date.now() - last.t > 600_000) return null;
  return last.text;
}

export function getClipboardHistory(): ClipboardEntry[] {
  return [...recentEntries];
}
