import { safeWarn, safeError, safeLog } from "../logger";
import {
  analyzeVision,
  VisionAnalyzeResult,
  VisionElement,
  VisionErrorCode,
} from "../vision";
import type { CaptureFrameMeta, CoordinateFrame } from "../screenCoordinates";
import {
  screenPointToPercent,
  getActiveCoordinateDisplay,
} from "../screenCoordinates";
import { dumpAxElements, type AxElement } from "../axDump";
import { createAnthropicClient, getAnthropicVisionModel } from "./config";

export interface ScreenCoordinate {
  label: string;
  x: number;
  y: number;
  confidence?: number;
}

export interface ScreenState {
  app: string;
  coordinates: ScreenCoordinate[];
  error?: string;
  fallbackAvailable?: boolean;
}

export interface ScreenTarget {
  id?: string;
  label: string;
  description?: string;
  x: number;
  y: number;
  viewportX?: number;
  viewportY?: number;
  confidence: number;
  action: "click" | "type" | "scroll" | "wait";
  source: "vision" | "manual" | "ax";
  sourceFrame?: CoordinateFrame;
  coordinateFrame?: CoordinateFrame;
  rawTarget?: {
    x: number;
    y: number;
    coordinateFrame: CoordinateFrame;
  };
  captureMeta?: CaptureFrameMeta;
  axElementIndex?: string;
  axApp?: string;
}

export interface ScreenTargetsResult {
  app: string;
  prompt: string;
  microTask: string;
  targets: ScreenTarget[];
  needsConfirmation: boolean;
  reason?: string;
  capturedAt: string;
  captureMeta?: CaptureFrameMeta;
  error?: string;
  fallbackAvailable?: boolean;
}

const TARGET_DETECTION_GUIDANCE = `Target selection policy for real-app teaching:
- For broad software-learning prompts, decompose the request into one visible micro-step.
- Prefer visible controls that directly match the user's intent.
- If the user asks about tabs in Google Chrome, Chrome tabs, browser tabs, or how to use tabs, the likely first micro-step is "Open a new tab".
- For Chrome tab prompts, prioritize "New tab button", "Tab strip", "Current tab", and "Address bar" candidates near the top browser UI.
- Do not choose page content when the prompt asks about browser UI.
- If multiple visible controls are plausible, return multiple candidates and make the recommendedAction describe the first micro-step.
- Label targets concretely from what is visible, for example "New tab button", "Save toolbar item", or "Send button".`;

export function fallbackScreenState(error?: string): ScreenState {
  return {
    app: "Unknown",
    coordinates: [],
    error,
    fallbackAvailable: true,
  };
}

function percent(value: any, fallback = 50): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : fallback;
}

export function fallbackScreenTargets(
  prompt = "",
  error?: string,
): ScreenTargetsResult {
  return {
    app: "Unknown",
    prompt,
    microTask: "First, I will teach one visible action.",
    targets: [],
    needsConfirmation: true,
    reason: "No visible targets were detected.",
    capturedAt: new Date().toISOString(),
    error,
    fallbackAvailable: true,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function pixelToPercentX(x: number, width?: number): number {
  if (!width || width <= 0) return percent(x);
  return clamp((x / width) * 100, 0, 100);
}

function pixelToPercentY(y: number, height?: number): number {
  if (!height || height <= 0) return percent(y);
  return clamp((y / height) * 100, 0, 100);
}

function elementTargetPoint(el: VisionElement): { x: number; y: number } {
  if (el.center) return el.center;

  if (el.bbox) {
    return {
      x: el.bbox.x + el.bbox.width / 2,
      y: el.bbox.y + el.bbox.height / 2,
    };
  }

  return { x: 0, y: 0 };
}

function isChromeTabsPrompt(prompt: string): boolean {
  return (
    /\bchrome\b/i.test(prompt) &&
    /\b(tab|tabs|new tab|tab strip|tab bar)\b/i.test(prompt)
  );
}

function chromeTabTargetScore(target: ScreenTarget): number {
  const label = `${target.label} ${target.description || ""}`.toLowerCase();
  let score = 0;

  if (/\bnew tab\b|\bplus\b|\+\s*button/.test(label)) score += 60;
  if (/\btab strip\b|\btab bar\b/.test(label)) score += 50;
  if (/\bcurrent tab\b|\btab\b/.test(label)) score += 30;
  if (/\baddress bar\b|\bomnibox\b/.test(label)) score += 20;
  if (target.y <= 18) score += 25;
  if (/\bpage content\b|\bweb page\b|\bsearch result\b|\bai mode\b/.test(label))
    score -= 45;

  return score;
}

function rankTargetsForPrompt(
  targets: ScreenTarget[],
  prompt: string,
): ScreenTarget[] {
  if (!isChromeTabsPrompt(prompt)) return targets;

  return [...targets].sort((a, b) => {
    const scoreDiff = chromeTabTargetScore(b) - chromeTabTargetScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.confidence || 0) - (a.confidence || 0);
  });
}

/**
 * Adapter to convert new VisionAnalyzeResult to legacy ScreenTargetsResult
 */
function adaptToScreenTargets(
  result: VisionAnalyzeResult,
  prompt: string,
  width?: number,
  height?: number,
): ScreenTargetsResult {
  return {
    app: result.summary.split(" ")[0] || "Unknown",
    prompt,
    microTask:
      result.recommendedAction || "First, I will teach one visible action.",
    targets: rankTargetsForPrompt(
      result.elements.map((el, index) => {
        const targetPoint = elementTargetPoint(el);
        const x = pixelToPercentX(targetPoint.x, width);
        const y = pixelToPercentY(targetPoint.y, height);

        return {
          id: `target-${index + 1}`,
          label: el.label,
          description: el.reasoning,
          x,
          y,
          confidence: el.confidence ?? 0.5,
          action: "click" as const,
          source: "vision" as const,
          sourceFrame: "capture" as const,
          coordinateFrame: "capture" as const,
          rawTarget: {
            x,
            y,
            coordinateFrame: "capture" as const,
          },
        };
      }),
      prompt,
    ),
    needsConfirmation: true,
    reason: result.warnings.join(". "),
    capturedAt: result.generatedAt,
  };
}

/**
 * Adapter to convert new VisionAnalyzeResult to legacy ScreenState
 */
function adaptToScreenState(
  result: VisionAnalyzeResult,
  width?: number,
  height?: number,
): ScreenState {
  return {
    app: result.summary.split(" ")[0] || "Unknown",
    coordinates: result.elements.map((el) => {
      const targetPoint = elementTargetPoint(el);

      return {
        label: el.label,
        x: pixelToPercentX(targetPoint.x, width),
        y: pixelToPercentY(targetPoint.y, height),
        confidence: el.confidence,
      };
    }),
  };
}

export async function detectScreenTargets(
  base64PNG?: string,
  prompt = "",
  width?: number,
  height?: number,
): Promise<ScreenTargetsResult> {
  const normalizedPrompt =
    typeof prompt === "string" && prompt.trim()
      ? prompt.trim()
      : "Teach one visible action";

  if (!base64PNG) {
    safeWarn(
      "[SCREEN_TARGETS] no screenshot provided; returning empty target set",
    );
    return fallbackScreenTargets(normalizedPrompt);
  }

  try {
    const result = await analyzeVision({
      imageBase64: base64PNG,
      mimeType: "image/png",
      task: "target_detection",
      userPrompt: normalizedPrompt,
      appContext: TARGET_DETECTION_GUIDANCE,
      screenshotWidth: width,
      screenshotHeight: height,
    });

    return adaptToScreenTargets(result, normalizedPrompt, width, height);
  } catch (error: any) {
    const code = error.code as VisionErrorCode;
    safeError(
      `[AI_BACKEND] Vision provider failed (${code}): ${error.message}`,
    );
    return fallbackScreenTargets(
      normalizedPrompt,
      code || "UNKNOWN_VISION_ERROR",
    );
  }
}

const AX_PICKER_SYSTEM = `You are the AX targeting layer for Specter, a desktop automation assistant. You receive:
1. A JSON list of accessibility elements from the focused macOS app. Each element has: i (numeric id), role, title, desc (description), value, x/y (top-left in screen pixels), w/h (width/height in pixels).
2. A screenshot of the user's display.
3. The user's intent for what they want to do.

Pick the best AX elements that match the user's intent. The element id ("i") is the source of truth — Specter will look up the bounds and click the exact center.

Return ONLY valid JSON, no markdown, no commentary:

{
  "candidates": [
    {
      "label": "short human label, e.g. 'New tab button'",
      "element_id": 123,
      "confidence": 0.0,
      "reasoning": "one short sentence on why this matches"
    }
  ],
  "summary": "what the user is looking at",
  "recommended_action": "describe the first micro-step in <15 words",
  "warnings": []
}

Rules:
- Return at most 5 candidates, ranked by relevance.
- element_id MUST be the integer "i" of one of the provided elements.
- Skip elements with role AXWindow, AXApplication, AXSplitGroup, or huge AXGroups that span the whole window — pick the smallest specific control that matches.
- Prefer elements with non-empty title or desc that names what the user wants.
- If nothing matches, return an empty candidates array and explain in warnings.`;

interface AxPickerCandidate {
  label: string;
  element_id: number;
  confidence: number;
  reasoning?: string;
}

interface AxPickerResponse {
  candidates: AxPickerCandidate[];
  summary?: string;
  recommended_action?: string;
  warnings?: string[];
}

function parseAxPickerJson(text: string): AxPickerResponse | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.candidates)) return null;
    return parsed as AxPickerResponse;
  } catch {
    return null;
  }
}

// Filter the raw AX tree down to a compact list small enough to fit in one
// model call: drop the empty wrapper groups that pad Electron apps and the
// roles that are never click targets. Keep both actionable and labeled
// elements so the model has the names it needs to reason.
function compactAxElements(elements: AxElement[]): AxElement[] {
  const skipRoles = new Set([
    "AXWindow",
    "AXApplication",
    "AXSplitGroup",
    "AXScrollArea",
    "AXScrollBar",
    "AXSplitter",
    "AXLayoutItem",
    "AXLayoutArea",
    "AXUnknown",
  ]);

  const filtered = elements.filter((el) => {
    if (skipRoles.has(el.role)) return false;
    // Drop elements with no label and no description that aren't actionable —
    // these are layout containers we can't talk about anyway.
    const hasLabel =
      (el.title && el.title.length > 0) ||
      (el.desc && el.desc.length > 0) ||
      (el.value && el.value.length > 0);
    if (!hasLabel && !el.actionable) return false;
    // Drop window-spanning groups: they're navigation-useless.
    if (el.role === "AXGroup" && el.w >= 1200 && el.h >= 700 && !hasLabel) {
      return false;
    }
    return true;
  });

  // Cap at 600 entries to keep prompt size reasonable even on huge web apps.
  return filtered.slice(0, 600);
}

function summarizeForModel(el: AxElement): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    i: el.i,
    role: el.role,
    x: Math.round(el.x),
    y: Math.round(el.y),
    w: Math.round(el.w),
    h: Math.round(el.h),
  };
  if (el.title) summary.title = el.title.slice(0, 120);
  if (el.desc) summary.desc = el.desc.slice(0, 120);
  if (el.value) summary.value = el.value.slice(0, 60);
  return summary;
}

// Bundle ids that resolve to Specter itself across dev / packaged / Electron-default
// builds. If we ever try to walk the AX tree for one of these, we'd be reading
// our own transparent overlay window — which gives no useful targets and is
// the root cause of the "ghost cursor lands wrong on non-browser apps" bug.
// Caller must skip the AX path in that case so vision can take over.
const SPECTER_SELF_BUNDLE_PATTERNS: RegExp[] = [
  /com\.electron(\..*)?$/i,
  /com\.specter(\..*)?$/i,
  /^Specter$/i,
  /^Electron$/i,
];

export function looksLikeSpecterSelf(identifier: string): boolean {
  if (!identifier) return false;
  return SPECTER_SELF_BUNDLE_PATTERNS.some((rx) => rx.test(identifier));
}

export async function detectScreenTargetsViaAx(
  prompt: string,
  screenshotBase64: string,
  imageWidth: number,
  imageHeight: number,
  appIdentifier?: string,
): Promise<ScreenTargetsResult | null> {
  const client = createAnthropicClient();
  if (!client) {
    safeWarn("[AX_TARGETS] Anthropic client unavailable; skipping AX path");
    return null;
  }

  // Prefer the caller-supplied identifier — that's the user's actual external
  // app, captured *before* Specter's overlay stole focus. Falling back to no
  // arg picks the current frontmost (which, once the overlay is up, is
  // Specter itself — useless for AX targeting).
  if (appIdentifier && looksLikeSpecterSelf(appIdentifier)) {
    safeWarn(
      "[AX_TARGETS] caller passed a Specter-self bundle id; skipping AX",
      { appIdentifier },
    );
    return null;
  }

  const dump = await dumpAxElements(appIdentifier);
  if (!dump || dump.elements.length === 0) {
    safeWarn("[AX_TARGETS] ax-dump returned no elements", {
      appIdentifier: appIdentifier ?? "(frontmost)",
      app: dump?.app,
      count: dump?.elements.length ?? 0,
    });
    return null;
  }
  // If we fell back to "frontmost" and that turned out to be Specter, the
  // resulting elements are useless for external-app teaching — bail so vision
  // runs against the captured screenshot instead.
  if (!appIdentifier && looksLikeSpecterSelf(dump.app)) {
    safeWarn("[AX_TARGETS] frontmost resolved to Specter; skipping AX", {
      app: dump.app,
    });
    return null;
  }
  const focusedApp = dump.app;

  const compact = compactAxElements(dump.elements);
  const elementById = new Map<number, AxElement>();
  for (const el of dump.elements) elementById.set(el.i, el);

  const display = getActiveCoordinateDisplay();
  const visionModel = getAnthropicVisionModel();

  safeLog("[AX_TARGETS] picking element via Claude", {
    app: focusedApp,
    rawCount: dump.elements.length,
    compactCount: compact.length,
    visionModel,
    displayId: display.id,
  });

  let response;
  try {
    response = await client.messages.create({
      model: visionModel,
      max_tokens: 1500,
      system: AX_PICKER_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: screenshotBase64,
              },
            },
            {
              type: "text",
              text:
                `User intent: ${prompt}\n\n` +
                `Screenshot dimensions: ${imageWidth}x${imageHeight} pixels.\n` +
                `Focused app: ${focusedApp}\n` +
                `Display bounds (screen coords): x=${display.bounds.x}, y=${display.bounds.y}, w=${display.bounds.width}, h=${display.bounds.height}\n\n` +
                `AX elements (positions are in screen coords, top-left origin):\n` +
                JSON.stringify(compact.map(summarizeForModel)),
            },
          ],
        },
      ],
    });
  } catch (error: any) {
    safeError("[AX_TARGETS] Claude call failed", {
      message: error?.message,
      status: error?.status,
    });
    return null;
  }

  const rawText = response.content
    .flatMap((part: any) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n");

  const parsed = parseAxPickerJson(rawText);
  if (!parsed) {
    safeWarn("[AX_TARGETS] Claude returned unparseable JSON", {
      preview: rawText.slice(0, 300),
    });
    return null;
  }

  const targets: ScreenTarget[] = [];
  for (const c of parsed.candidates.slice(0, 5)) {
    if (!c || typeof c.element_id !== "number") continue;
    const el = elementById.get(c.element_id);
    if (!el) {
      safeWarn("[AX_TARGETS] model returned unknown element_id", {
        id: c.element_id,
      });
      continue;
    }
    if (el.w <= 0 || el.h <= 0) continue;

    // AX bounds are in macOS global screen coords (top-left origin, points).
    // Convert the element center to viewport-percent of the active display so
    // the rest of the cursor pipeline (which is already display-relative) maps
    // straight back to the same pixel.
    const centerScreenX = el.x + el.w / 2;
    const centerScreenY = el.y + el.h / 2;
    const viewport = screenPointToPercent(centerScreenX, centerScreenY);

    // Pixel coordinates from AX bounds are exact — the CGEvent click pipeline
    // will land on the element. We deliberately do NOT set axElementIndex
    // here: ax-dump indices are not interchangeable with openara indices, so
    // routing through openara's element_index click would click the wrong
    // thing. Pixel-perfect coords + the existing CGEvent path is enough.
    targets.push({
      id: `ax-target-${targets.length + 1}`,
      label:
        typeof c.label === "string" && c.label
          ? c.label
          : el.title || el.desc || el.role,
      description: c.reasoning,
      x: viewport.x,
      y: viewport.y,
      viewportX: viewport.x,
      viewportY: viewport.y,
      confidence:
        typeof c.confidence === "number"
          ? Math.min(1, Math.max(0, c.confidence))
          : 0.85,
      action: "click" as const,
      source: "ax" as const,
      sourceFrame: "viewport" as const,
      coordinateFrame: "viewport" as const,
      rawTarget: {
        x: viewport.x,
        y: viewport.y,
        coordinateFrame: "viewport" as const,
      },
    });
  }

  safeLog("[AX_TARGETS] candidates", {
    app: dump.app,
    count: targets.length,
    targets: targets.map((t) => ({
      label: t.label,
      x: t.x,
      y: t.y,
    })),
  });

  if (targets.length === 0) return null;

  return {
    app: dump.app,
    prompt,
    microTask:
      parsed.recommended_action || "First, I will teach one visible action.",
    targets,
    needsConfirmation: true,
    reason: Array.isArray(parsed.warnings) ? parsed.warnings.join(". ") : "",
    capturedAt: new Date().toISOString(),
  };
}

export async function analyzeScreen(
  base64PNG?: string,
  width?: number,
  height?: number,
): Promise<ScreenState> {
  if (!base64PNG) {
    safeWarn("[Specter] No screenshot provided; skipping screen analysis.");
    return fallbackScreenState();
  }

  try {
    const result = await analyzeVision({
      imageBase64: base64PNG,
      mimeType: "image/png",
      task: "screen_understanding",
      screenshotWidth: width,
      screenshotHeight: height,
    });

    return adaptToScreenState(result, width, height);
  } catch (error: any) {
    const code = error.code as VisionErrorCode;
    safeError(
      `[AI_BACKEND] Vision provider failed (${code}): ${error.message}`,
    );
    return fallbackScreenState(code || "UNKNOWN_VISION_ERROR");
  }
}
