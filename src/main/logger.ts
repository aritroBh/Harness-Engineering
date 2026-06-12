const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9._-]{8,}/g,
  /sk-proj-[A-Za-z0-9._-]{8,}/g,
  /sk-[A-Za-z0-9._-]{8,}/g,
  /nvapi-[A-Za-z0-9._-]+/g,
  /(OPENAI_API_KEY|ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|NVIDIA_API_KEY)\s*=\s*["']?[^"'\s]+/gi,
  /(x-api-key|authorization)\s*:\s*["']?[^"',\s}]+/gi,
];

function redactString(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value,
  );
}

function sanitize(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" || value === null) return value;
  if (depth > 4) return "[Object]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      /key|token|secret|authorization/i.test(key) && typeof entry === "string"
        ? "[REDACTED]"
        : sanitize(entry, depth + 1, seen),
    ]),
  );
}

export function safeLog(...args: unknown[]): void {
  try {
    console.log(...args.map((arg) => sanitize(arg)));
  } catch {
    // swallow stdout EIO errors
  }
}

export function safeWarn(...args: unknown[]): void {
  try {
    console.warn(...args.map((arg) => sanitize(arg)));
  } catch {
    // swallow stdout EIO errors
  }
}

export function safeError(...args: unknown[]): void {
  try {
    console.error(...args.map((arg) => sanitize(arg)));
  } catch {
    // swallow stdout EIO errors
  }
}
