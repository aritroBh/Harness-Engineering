import { VisionElement, VisionProviderName } from "./types";
import { VisionProviderError } from "./errors";

export interface ParsedVisionOutput {
  summary: string;
  elements: VisionElement[];
  recommendedAction?: string;
  warnings: string[];
}

export interface VisionValidationOptions {
  width?: number;
  height?: number;
}

export function extractJsonObject(text: string): unknown {
  try {
    // 1. First try direct JSON.parse
    return JSON.parse(text);
  } catch (e) {
    let startIdx = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index++) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = inString;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") {
        if (depth === 0) startIdx = index;
        depth++;
      } else if (char === "}" && depth > 0) {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const jsonStr = text.substring(startIdx, index + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {
            startIdx = -1;
          }
        }
      }
    }

    throw new Error("No valid JSON object found in text");
  }
}

function validCoordinate(value: unknown, max?: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    (typeof max !== "number" || max <= 0 || value <= max)
  );
}

function validSize(
  value: unknown,
  origin: number,
  max?: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    (typeof max !== "number" || max <= 0 || origin + value <= max)
  );
}

export function validateVisionOutput(
  value: unknown,
  options: VisionValidationOptions = {},
): ParsedVisionOutput {
  if (!value || typeof value !== "object") {
    throw new Error("Value is not an object");
  }

  const obj = value as any;

  const result: ParsedVisionOutput = {
    summary:
      typeof obj.summary === "string" ? obj.summary : "No summary provided",
    elements: [],
    recommendedAction:
      typeof obj.recommendedAction === "string"
        ? obj.recommendedAction
        : undefined,
    warnings: Array.isArray(obj.warnings)
      ? obj.warnings.filter((w: any) => typeof w === "string")
      : [],
  };

  if (Array.isArray(obj.elements)) {
    result.elements = obj.elements
      .map((el: any) => {
        if (!el || typeof el !== "object" || typeof el.label !== "string") {
          return null;
        }

        const validatedElement: VisionElement = {
          label: el.label,
          type: el.type, // Should ideally validate against allowed types
          text: typeof el.text === "string" ? el.text : undefined,
          reasoning:
            typeof el.reasoning === "string" ? el.reasoning : undefined,
        };

        if (typeof el.confidence === "number") {
          validatedElement.confidence = Math.min(1, Math.max(0, el.confidence));
        }

        if (el.bbox && typeof el.bbox === "object") {
          const { x, y, width, height } = el.bbox;
          if (
            validCoordinate(x, options.width) &&
            validCoordinate(y, options.height) &&
            validSize(width, x, options.width) &&
            validSize(height, y, options.height)
          ) {
            validatedElement.bbox = { x, y, width, height };
          }
        }

        if (el.center && typeof el.center === "object") {
          const { x, y } = el.center;
          if (
            validCoordinate(x, options.width) &&
            validCoordinate(y, options.height)
          ) {
            validatedElement.center = { x, y };
          }
        }

        return validatedElement;
      })
      .filter((el): el is VisionElement => el !== null);
  }

  return result;
}

export function parseVisionJson(
  text: string,
  provider: VisionProviderName,
  options: VisionValidationOptions = {},
): ParsedVisionOutput {
  try {
    const raw = extractJsonObject(text);
    return validateVisionOutput(raw, options);
  } catch (error: any) {
    throw new VisionProviderError(
      "PROVIDER_PARSE_ERROR",
      provider,
      `Failed to parse vision JSON: ${error.message}`,
      undefined,
      error,
    );
  }
}
