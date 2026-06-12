import {
  dumpAxElements,
  getFrontmostApp,
  preferredAppIdentifier,
  type FrontmostApp,
} from "../axDump";
import { looksLikeSpecterSelf } from "../ai/screener";
import {
  getRecentActivityHints,
  getTypingBurstCount,
  recordBehavioralFrame,
} from "../behavioral/tracker";
import { safeLog, safeWarn } from "../logger";
import { probeBrowserUrl } from "./browserUrlProbe";
import { pollClipboard, getRecentClipboardText } from "./clipboardContext";
import {
  loadPersistedContextHistory,
  persistContextSnapshot,
} from "./contextStorage";
import { getRecentTypedText } from "./typedContextBuffer";
import { axEventWatcher } from "./axEventWatcher";
import type { SerializedTree } from "../../shared/partA-contract";

export interface ActivityHint {
  actionType: string;
  t: number;
  app?: string;
}

export interface AppSwitchEvent {
  appName: string | null;
  bundleId: string | null;
  t: number;
}

export interface ContextSnapshot {
  capturedAt: number;
  bundleId: string | null;
  appName: string | null;
  windowTitle: string | null;
  pageUrl: string | null;
  searchHint: string | null;
  recentTypedText: string | null;
  recentClipboard: string | null;
  lastVoiceTranscript: string | null;
  recentActivity: ActivityHint[];
  recentAppSwitches: AppSwitchEvent[];
  typingBurstCount: number;
}

const HISTORY_MAX = 40;
const FALLBACK_POLL_INTERVAL_MS = 15_000;

const BROWSER_BUNDLES = new Set([
  "com.google.Chrome",
  "com.apple.Safari",
  "org.mozilla.firefox",
  "company.thebrowser.Browser",
  "com.microsoft.edgemac",
  "com.brave.Browser",
  "com.operasoftware.Opera",
]);

let fallbackPollTimer: NodeJS.Timeout | null = null;
let pollInflight = false;
let pollCount = 0;
let history: ContextSnapshot[] = [];
let latestSnapshot: ContextSnapshot | null = null;
let lastVoiceTranscript: string | null = null;
let lastVoiceAt = 0;
let lastBundleId: string | null = null;
let appSwitches: AppSwitchEvent[] = [];
let currentWatchBundleId: string | null = null;
let treeChangedSubscribed = false;

function emptySnapshot(): ContextSnapshot {
  return {
    capturedAt: Date.now(),
    bundleId: null,
    appName: null,
    windowTitle: null,
    pageUrl: null,
    searchHint: null,
    recentTypedText: null,
    recentClipboard: null,
    lastVoiceTranscript: null,
    recentActivity: [],
    recentAppSwitches: [],
    typingBurstCount: 0,
  };
}

function extractSearchHint(
  windowTitle: string | null,
  pageUrl: string | null,
): string | null {
  if (pageUrl) {
    try {
      const url = new URL(pageUrl);
      const q = url.searchParams.get("q") || url.searchParams.get("query");
      if (q?.trim()) return q.trim();
    } catch {
      /* ignore malformed URL */
    }
  }

  if (!windowTitle) return null;
  const googleMatch = windowTitle.match(/^(.+?)\s+-\s+Google(?:\s+Search)?$/i);
  if (googleMatch?.[1]) return googleMatch[1].trim();
  const bingMatch = windowTitle.match(/^(.+?)\s+-\s+Search$/i);
  if (bingMatch?.[1] && windowTitle.toLowerCase().includes("bing"))
    return bingMatch[1].trim();
  return null;
}

function extractPageContextFromAx(
  elements: Array<{
    role: string;
    title: string;
    desc: string;
    value: string;
  }>,
): { windowTitle: string | null; pageUrl: string | null } {
  const windowEl = elements.find(
    (el) =>
      el.role === "AXWindow" ||
      el.role.toLowerCase().includes("window") ||
      el.role === "AXDocument",
  );
  const windowTitle =
    (windowEl?.title && windowEl.title.trim()) ||
    elements.find((el) => el.title?.trim())?.title?.trim() ||
    null;

  const urlEl = elements.find((el) => {
    const value = typeof el.value === "string" ? el.value.trim() : "";
    const desc = (el.desc || "").toLowerCase();
    const title = (el.title || "").toLowerCase();
    return (
      /^https?:\/\//i.test(value) ||
      desc.includes("address") ||
      title.includes("address") ||
      desc.includes("url")
    );
  });
  const pageUrl =
    (urlEl?.value && /^https?:\/\//i.test(urlEl.value) ? urlEl.value : null) ||
    elements.find((el) => /^https?:\/\//i.test(el.value || ""))?.value ||
    null;

  return { windowTitle, pageUrl };
}

function isExternalApp(app: FrontmostApp | null): boolean {
  if (!app) return false;
  const id = preferredAppIdentifier(app);
  if (!id) return false;
  return !looksLikeSpecterSelf(id);
}

function recordAppSwitch(
  bundleId: string | null,
  appName: string | null,
): void {
  if (!bundleId || bundleId === lastBundleId) return;

  const event: AppSwitchEvent = {
    appName,
    bundleId,
    t: Date.now(),
  };
  appSwitches = [...appSwitches, event].slice(-20);

  if (lastBundleId) {
    recordBehavioralFrame({
      t: Date.now(),
      dwellMs: 0,
      actionType: "app-switch",
      revisionSignal: 0,
      app: appName || bundleId,
      targetLabel: appName || bundleId,
    });
  }

  lastBundleId = bundleId;
  safeLog("[CONTEXT] app switch", { appName, bundleId });

  // Restart AX watcher for the new app
  if (
    bundleId &&
    isExternalApp({ bundleId, name: appName, pid: 0 } as FrontmostApp)
  ) {
    startWatcherForApp(bundleId);
  }
}

async function buildSnapshotFromTree(
  tree: SerializedTree,
  reason: string,
): Promise<ContextSnapshot> {
  const bundleId = tree.app; // tree.app is the app name from dump
  const appName = tree.app;

  // Extract window title and URL from the tree
  const windowEl = tree.elements.find(
    (el) => el.role === "AXWindow" || el.role === "AXDocument",
  );
  const windowTitle = windowEl?.label?.trim() || tree.window || null;

  // Find URL-like elements
  const urlEl = tree.elements.find((el) => {
    const value = el.value?.trim() || "";
    return /^https?:\/\//i.test(value);
  });
  const pageUrl = urlEl?.value?.trim() || null;

  // For browsers, also probe the URL
  let finalPageUrl = pageUrl;
  if (bundleId && BROWSER_BUNDLES.has(bundleId)) {
    const probedUrl = await probeBrowserUrl(bundleId);
    if (probedUrl) finalPageUrl = probedUrl;
  }

  const clipboardText = pollClipboard();

  const snapshot: ContextSnapshot = {
    capturedAt: Date.now(),
    bundleId,
    appName,
    windowTitle,
    pageUrl: finalPageUrl,
    searchHint: extractSearchHint(windowTitle, finalPageUrl),
    recentTypedText: getRecentTypedText(),
    recentClipboard: clipboardText || getRecentClipboardText(),
    lastVoiceTranscript:
      lastVoiceAt > Date.now() - 300_000 ? lastVoiceTranscript : null,
    recentActivity: getRecentActivityHints(12),
    recentAppSwitches: [...appSwitches].slice(-8),
    typingBurstCount: getTypingBurstCount(60_000),
  };

  latestSnapshot = snapshot;
  history = [...history, snapshot].slice(-HISTORY_MAX);

  if (pollCount % 3 === 0) {
    persistContextSnapshot(snapshot);
  }

  safeLog("[CONTEXT] snapshot", {
    reason,
    appName,
    windowTitle: windowTitle?.slice(0, 80) || null,
    pageUrl: finalPageUrl?.slice(0, 80) || null,
    searchHint: snapshot.searchHint,
    typed: snapshot.recentTypedText?.slice(0, 40) || null,
    typingBurstCount: snapshot.typingBurstCount,
  });
  return snapshot;
}

async function pollContextFallback(
  reason = "fallback",
): Promise<ContextSnapshot> {
  if (pollInflight) {
    return latestSnapshot || emptySnapshot();
  }
  pollInflight = true;
  pollCount += 1;

  try {
    const frontmost = await getFrontmostApp();
    if (!isExternalApp(frontmost)) {
      return latestSnapshot || emptySnapshot();
    }

    const bundleId = frontmost?.bundleId || null;
    const appName = frontmost?.name || frontmost?.bundleId || null;
    recordAppSwitch(bundleId, appName);

    let windowTitle: string | null = null;
    let pageUrl: string | null = null;

    const shouldDumpAx =
      bundleId !== null &&
      (BROWSER_BUNDLES.has(bundleId) ||
        history.length === 0 ||
        history[history.length - 1]?.bundleId !== bundleId);

    if (shouldDumpAx) {
      const appId = preferredAppIdentifier(frontmost);
      const dump = appId ? await dumpAxElements(appId, 2_500) : null;
      if (dump?.elements?.length) {
        const extracted = extractPageContextFromAx(dump.elements);
        windowTitle = extracted.windowTitle;
        pageUrl = extracted.pageUrl;
      }
    } else if (history.length > 0) {
      const prev = history[history.length - 1];
      windowTitle = prev.windowTitle;
      pageUrl = prev.pageUrl;
    }

    if (bundleId && BROWSER_BUNDLES.has(bundleId)) {
      const probedUrl = await probeBrowserUrl(bundleId);
      if (probedUrl) pageUrl = probedUrl;
    }

    const clipboardText = pollClipboard();

    const snapshot: ContextSnapshot = {
      capturedAt: Date.now(),
      bundleId,
      appName,
      windowTitle,
      pageUrl,
      searchHint: extractSearchHint(windowTitle, pageUrl),
      recentTypedText: getRecentTypedText(),
      recentClipboard: clipboardText || getRecentClipboardText(),
      lastVoiceTranscript:
        lastVoiceAt > Date.now() - 300_000 ? lastVoiceTranscript : null,
      recentActivity: getRecentActivityHints(12),
      recentAppSwitches: [...appSwitches].slice(-8),
      typingBurstCount: getTypingBurstCount(60_000),
    };

    latestSnapshot = snapshot;
    history = [...history, snapshot].slice(-HISTORY_MAX);

    if (pollCount % 3 === 0) {
      persistContextSnapshot(snapshot);
    }

    safeLog("[CONTEXT] fallback snapshot", {
      reason,
      appName,
      windowTitle: windowTitle?.slice(0, 80) || null,
      pageUrl: pageUrl?.slice(0, 80) || null,
      searchHint: snapshot.searchHint,
      typed: snapshot.recentTypedText?.slice(0, 40) || null,
      typingBurstCount: snapshot.typingBurstCount,
    });
    return snapshot;
  } catch (error) {
    safeWarn("[CONTEXT] fallback poll failed", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return latestSnapshot || emptySnapshot();
  } finally {
    pollInflight = false;
  }
}

function startWatcherForApp(bundleId: string): void {
  if (currentWatchBundleId === bundleId) return;
  if (currentWatchBundleId) {
    axEventWatcher.stop();
  }
  currentWatchBundleId = bundleId;
  axEventWatcher.start(bundleId);

  // Subscribe to tree changes exactly once — startWatcherForApp runs on every
  // app switch, so re-subscribing here would leak listeners and fire the
  // snapshot builder N times per event.
  if (!treeChangedSubscribed) {
    treeChangedSubscribed = true;
    axEventWatcher.on("treeChanged", async (tree: SerializedTree) => {
      await buildSnapshotFromTree(tree, "ax-event");
    });
  }

  safeLog("[CONTEXT] started AX watcher", { bundleId });
}

export function startContextTracking(): void {
  if (fallbackPollTimer) return;
  history = loadPersistedContextHistory().slice(-HISTORY_MAX);
  if (history.length > 0) {
    latestSnapshot = history[history.length - 1];
    lastBundleId = latestSnapshot.bundleId;
  }

  // Initial snapshot via fallback
  void pollContextFallback("startup");

  // Start fallback poll for browsers / when AX watcher isn't available
  fallbackPollTimer = setInterval(() => {
    void pollContextFallback("fallback-interval");
  }, FALLBACK_POLL_INTERVAL_MS);

  // Also start AX watcher for the current foreground app
  void (async () => {
    const frontmost = await getFrontmostApp();
    if (frontmost && isExternalApp(frontmost)) {
      const bundleId = frontmost.bundleId || frontmost.name || "";
      if (bundleId) startWatcherForApp(bundleId);
    }
  })();

  safeLog("[CONTEXT] tracking started (event-driven + fallback)", {
    fallbackIntervalMs: FALLBACK_POLL_INTERVAL_MS,
  });
}

export function stopContextTracking(): void {
  if (fallbackPollTimer) {
    clearInterval(fallbackPollTimer);
    fallbackPollTimer = null;
  }
  if (currentWatchBundleId) {
    axEventWatcher.stop();
    currentWatchBundleId = null;
  }
  if (latestSnapshot) {
    persistContextSnapshot(latestSnapshot);
  }
}

export async function refreshContextNow(
  reason = "manual",
): Promise<ContextSnapshot> {
  return pollContextFallback(reason);
}

export function getLatestContextSnapshot(): ContextSnapshot {
  return latestSnapshot || emptySnapshot();
}

export function getForegroundAppLabel(): string | null {
  return latestSnapshot?.appName || latestSnapshot?.bundleId || null;
}

export function getContextHistory(): ContextSnapshot[] {
  return [...history];
}

export function recordVoiceTranscript(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  lastVoiceTranscript = trimmed.slice(0, 500);
  lastVoiceAt = Date.now();
  safeLog("[CONTEXT] voice transcript recorded", {
    preview: lastVoiceTranscript.slice(0, 80),
  });
}

export function formatContextSummary(snapshot: ContextSnapshot): string {
  const lines: string[] = [];
  if (snapshot.appName) lines.push(`App: ${snapshot.appName}`);
  if (snapshot.windowTitle) lines.push(`Window: ${snapshot.windowTitle}`);
  if (snapshot.pageUrl) lines.push(`URL: ${snapshot.pageUrl}`);
  if (snapshot.searchHint) lines.push(`Search: ${snapshot.searchHint}`);
  if (snapshot.recentTypedText)
    lines.push(`Typed: ${snapshot.recentTypedText}`);
  if (snapshot.recentClipboard)
    lines.push(`Clipboard: ${snapshot.recentClipboard}`);
  if (snapshot.lastVoiceTranscript)
    lines.push(`Recent voice: ${snapshot.lastVoiceTranscript}`);
  if (snapshot.typingBurstCount > 0)
    lines.push(`Typing events (60s): ${snapshot.typingBurstCount}`);
  const activity = snapshot.recentActivity
    .map((item) => item.actionType)
    .slice(-6)
    .join(", ");
  if (activity) lines.push(`Recent input: ${activity}`);
  const switches = snapshot.recentAppSwitches
    .map((item) => item.appName || item.bundleId)
    .filter(Boolean)
    .slice(-4)
    .join(" → ");
  if (switches) lines.push(`App flow: ${switches}`);
  return lines.join("\n");
}
