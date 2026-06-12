type LogLevel = "info" | "warn" | "error";

const PHI_KEYS = new Set([
  "rawText",
  "raw_text",
  "extractedSections",
  "extracted_sections",
  "draft_note",
  "summary",
  "patientId",
  "patient_id",
  "encounterId",
  "encounter_id",
  "noteText",
  "noteContent",
]);

function phiLoggingEnabled(): boolean {
  return process.env.LOG_PHI === "true";
}

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 80) return `[redacted ${value.length} chars]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PHI_KEYS.has(k)) {
        out[k] = "[redacted PHI]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, message: string, data?: unknown): void {
  const payload =
    data === undefined
      ? ""
      : JSON.stringify(phiLoggingEnabled() ? data : redact(data));
  const line = `[CLINICAL] ${message}${payload ? " " + payload : ""}`;
  if (level === "warn") {
    console.warn(line);
  } else if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function clinicalLog(message: string, data?: unknown): void {
  emit("info", message, data);
}

export function clinicalWarn(message: string, data?: unknown): void {
  emit("warn", message, data);
}

export function clinicalError(message: string, data?: unknown): void {
  emit("error", message, data);
}

export function isPhiLoggingEnabled(): boolean {
  return phiLoggingEnabled();
}

export function _redactForTests(value: unknown): unknown {
  return redact(value);
}
