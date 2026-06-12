import {
  dumpAxElements,
  getFrontmostApp,
  preferredAppIdentifier,
  type AxElement,
  type AxDumpResult,
} from "../axDump";
import { screenPointToPercent } from "../screenCoordinates";
import { looksLikeSpecterSelf } from "../ai/screener";
import { safeLog, safeWarn } from "../logger";

export interface LiveResolvedTarget {
  viewportX: number;
  viewportY: number;
  label: string;
  action: "click" | "type" | "scroll" | "wait";
  confidence: number;
}

const CACHE_TTL_MS = 600;
const MATCH_THRESHOLD = 0.35;
// 800ms covers a warm deep dump (~400ms on a 1000-element Electron tree) plus
// headroom; first-ever dump on an Electron app may still time out once while
// AXManualAccessibility settles — the background context poll warms it.
const AX_DUMP_TIMEOUT_MS = 800;

interface LiveTargetCacheEntry {
  appId: string;
  dump: AxDumpResult;
  fetchedAt: number;
}

let liveTargetCache: LiveTargetCacheEntry | null = null;

export function invalidateLiveTargetCache(): void {
  liveTargetCache = null;
}

/**
 * When the overlay is summoned/focused, NSWorkspace's frontmost app is Specter
 * itself — walking its AX tree finds nothing, so conversational ghost pops
 * silently fail. index.ts registers a provider that returns the identifier of
 * the user's real foreground app captured *before* the overlay was shown.
 */
type ExternalAppFallback = () => string | null;

let externalAppFallback: ExternalAppFallback | null = null;

export function setLiveTargetExternalAppFallback(
  provider: ExternalAppFallback,
): void {
  externalAppFallback = provider;
}

/** Unique AX title/desc/value strings from the frontmost app (for model grounding). */
export async function listVisibleAxLabels(maxLabels = 60): Promise<string[]> {
  const dump = await getCachedAxDump();
  if (!dump?.elements?.length) return [];

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const element of dump.elements) {
    for (const field of [element.title, element.desc, element.value]) {
      const trimmed = typeof field === "string" ? field.trim() : "";
      if (!trimmed || trimmed.length < 2) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(trimmed);
      if (labels.length >= maxLabels) return labels;
    }
  }
  return labels;
}

/** True when fuzzy matcher would resolve targetLabel against visible label strings. */
export function isLabelResolvableInVisibleSet(
  targetLabel: string,
  visibleLabels: string[],
): boolean {
  const trimmed = targetLabel.trim();
  if (!trimmed) return false;
  if (!visibleLabels.length) return true;

  const fakeElements: AxElement[] = visibleLabels.map((label, index) => ({
    i: index,
    depth: 0,
    title: label,
    desc: "",
    value: "",
    role: "AXUnknown",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    actionable: true,
  }));

  return pickBestElement(fakeElements, trimmed) !== null;
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreElement(element: AxElement, targetLabel: string): number {
  const label = normalizeText(targetLabel);
  if (!label) return 0;

  const fields = [element.title, element.desc, element.value]
    .map((field) => normalizeText(field))
    .filter(Boolean);

  let best = 0;
  for (const field of fields) {
    if (field === label) {
      best = 1;
      break;
    }

    if (field.includes(label) || label.includes(field)) {
      const overlap =
        Math.min(label.length, field.length) /
        Math.max(label.length, field.length, 1);
      // Generous score only for substantial overlap; a short label buried in a
      // long string (e.g. "Save" inside "replaySavedWorkflow") scores its raw
      // ratio and falls below the match threshold.
      best = Math.max(best, overlap >= 0.5 ? 0.55 + overlap * 0.45 : overlap);
    }

    const labelTokens = tokenize(label);
    const fieldTokens = tokenize(field);
    if (labelTokens.length > 0 && fieldTokens.length > 0) {
      const matchedWeight = labelTokens.reduce((acc, token) => {
        let tokenBest = 0;
        for (const fieldToken of fieldTokens) {
          if (fieldToken === token) {
            tokenBest = 1;
            break;
          }
          if (fieldToken.includes(token)) {
            tokenBest = Math.max(tokenBest, token.length / fieldToken.length);
          } else if (token.includes(fieldToken)) {
            tokenBest = Math.max(tokenBest, fieldToken.length / token.length);
          }
        }
        return acc + tokenBest;
      }, 0);
      const tokenScore =
        matchedWeight / Math.max(labelTokens.length, fieldTokens.length, 1);
      best = Math.max(best, tokenScore);
    }
  }

  if (element.actionable) {
    best = Math.min(1, best + 0.1);
  }

  return best;
}

function pickBestElement(
  elements: AxElement[],
  targetLabel: string,
): { element: AxElement; score: number } | null {
  let best: { element: AxElement; score: number } | null = null;

  for (const element of elements) {
    if (element.w <= 0.5 || element.h <= 0.5) continue;
    const score = scoreElement(element, targetLabel);
    if (score < MATCH_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { element, score };
    } else if (
      best &&
      score === best.score &&
      element.actionable &&
      !best.element.actionable
    ) {
      best = { element, score };
    }
  }

  return best;
}

async function getCachedAxDump(): Promise<AxDumpResult | null> {
  const frontmost = await getFrontmostApp(1_500);
  let appId = preferredAppIdentifier(frontmost);

  if (!appId || looksLikeSpecterSelf(appId)) {
    const fallbackId = externalAppFallback?.() ?? null;
    if (fallbackId) {
      safeLog("[LIVE_TARGET] frontmost is Specter; using cached foreground", {
        frontmost: appId,
        fallback: fallbackId,
      });
      appId = fallbackId;
    }
  }

  if (!appId || looksLikeSpecterSelf(appId)) {
    safeWarn("[LIVE_TARGET] no external app to walk, skipping ghost pop", {
      frontmost: appId,
    });
    return null;
  }

  const now = Date.now();
  if (
    liveTargetCache &&
    liveTargetCache.appId === appId &&
    now - liveTargetCache.fetchedAt < CACHE_TTL_MS
  ) {
    return liveTargetCache.dump;
  }

  const dump = await dumpAxElements(appId, AX_DUMP_TIMEOUT_MS);
  if (!dump) {
    safeWarn("[LIVE_TARGET] ax dump timed out, skipping ghost pop");
    return null;
  }

  liveTargetCache = {
    appId,
    dump,
    fetchedAt: now,
  };
  return dump;
}

export async function resolveLiveTarget(
  targetLabel: string,
  action: "click" | "type" | "scroll" | "wait",
): Promise<LiveResolvedTarget | null> {
  const trimmedLabel = targetLabel.trim();
  if (!trimmedLabel) return null;

  const dump = await getCachedAxDump();
  if (!dump?.elements?.length) {
    return null;
  }

  const match = pickBestElement(dump.elements, trimmedLabel);
  if (!match) {
    safeLog("[LIVE_TARGET] no match", { targetLabel: trimmedLabel });
    return null;
  }

  const centerX = match.element.x + match.element.w / 2;
  const centerY = match.element.y + match.element.h / 2;
  const viewport = screenPointToPercent(centerX, centerY);
  const label =
    match.element.title ||
    match.element.desc ||
    match.element.value ||
    trimmedLabel;

  safeLog("[LIVE_TARGET] resolved", {
    targetLabel: trimmedLabel,
    matchedTitle:
      match.element.title || match.element.desc || match.element.value,
    score: Number(match.score.toFixed(3)),
    viewportX: Number(viewport.x.toFixed(2)),
    viewportY: Number(viewport.y.toFixed(2)),
  });

  return {
    viewportX: viewport.x,
    viewportY: viewport.y,
    label,
    action,
    confidence: match.score,
  };
}
