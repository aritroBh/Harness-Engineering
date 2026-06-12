import { ultraConverse } from "../ai/planner";
import { getResumePrompt } from "../session/graph";
import { loadGraph } from "../session/storage";
import { safeLog, safeWarn } from "../logger";
import {
  formatContextSummary,
  refreshContextNow,
  type ContextSnapshot,
} from "./contextTracker";

const DEFAULT_APP_NAME = "Specter";

export interface ProactivePredictionResult {
  ok: boolean;
  prediction: string;
  context: ContextSnapshot;
  resumePrompt: string;
  memoryContext: string | null;
  error?: string;
}

function isProactiveEnabled(): boolean {
  return process.env.SPECTER_PROACTIVE_PREDICT !== "false";
}

function buildProactiveMemoryQuery(snapshot: ContextSnapshot): string {
  const hints: string[] = [];
  if (snapshot.appName) hints.push(`app=${snapshot.appName}`);
  if (snapshot.windowTitle) hints.push(`window=${snapshot.windowTitle}`);
  if (snapshot.pageUrl) hints.push(`url=${snapshot.pageUrl}`);
  if (snapshot.searchHint) hints.push(`search=${snapshot.searchHint}`);
  if (snapshot.recentTypedText) hints.push(`typed=${snapshot.recentTypedText}`);
  if (snapshot.recentClipboard)
    hints.push(`clipboard=${snapshot.recentClipboard}`);
  if (snapshot.lastVoiceTranscript)
    hints.push(`voice=${snapshot.lastVoiceTranscript}`);
  if (snapshot.typingBurstCount > 0)
    hints.push(`typingEvents60s=${snapshot.typingBurstCount}`);
  const activity = snapshot.recentActivity
    .map((item) => item.actionType)
    .join(",");
  if (activity) hints.push(`activity=${activity}`);

  return `User summoned assistant without typing. Context: ${hints.join("; ")}. What are they likely doing and what past workflow memory helps?`;
}

async function queryGhostWiki(queryText: string): Promise<string | null> {
  const port = process.env.MEMORY_SERVICE_PORT || "8765";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_500);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: queryText }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; answer?: string };
    if (json?.ok && typeof json.answer === "string" && json.answer.trim()) {
      return json.answer.trim().slice(0, 600);
    }
    return null;
  } catch (error) {
    safeWarn("[PROACTIVE] ghostwiki query failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fallbackPrediction(
  snapshot: ContextSnapshot,
  resumePrompt: string,
  memoryContext: string | null,
): string {
  const parts: string[] = [];

  if (snapshot.searchHint) {
    parts.push(
      `Looks like you're searching for "${snapshot.searchHint}". I can pull related workflows from memory.`,
    );
  } else if (snapshot.recentTypedText) {
    parts.push(`You were typing "${snapshot.recentTypedText}".`);
  } else if (snapshot.windowTitle && snapshot.appName) {
    parts.push(`You're in ${snapshot.appName} on "${snapshot.windowTitle}".`);
  } else if (snapshot.appName) {
    parts.push(`You're in ${snapshot.appName}.`);
  }

  if (snapshot.typingBurstCount >= 10) {
    parts.push("Lots of typing — want help finishing this?");
  }

  if (memoryContext) {
    parts.push(memoryContext);
  } else if (resumePrompt && !resumePrompt.startsWith("Welcome to Specter")) {
    parts.push(resumePrompt);
  }

  parts.push("Tell me what to do, or I'll walk you through the next step.");
  return parts.join(" ");
}

export async function buildProactivePrediction(): Promise<ProactivePredictionResult> {
  const snapshot = await refreshContextNow("overlay summon");
  const resumePrompt = getResumePrompt(loadGraph(DEFAULT_APP_NAME));

  if (!isProactiveEnabled()) {
    return {
      ok: true,
      prediction: fallbackPrediction(snapshot, resumePrompt, null),
      context: snapshot,
      resumePrompt,
      memoryContext: null,
    };
  }

  const memoryQuery = buildProactiveMemoryQuery(snapshot);
  const memoryContext = await queryGhostWiki(memoryQuery);
  const contextSummary = formatContextSummary(snapshot);

  const combinedMemory = [memoryContext, resumePrompt, contextSummary]
    .filter((part) => typeof part === "string" && part.trim())
    .join("\n\n");

  const screenState = {
    app: snapshot.appName || "Unknown",
    windowTitle: snapshot.windowTitle,
    pageUrl: snapshot.pageUrl,
    searchHint: snapshot.searchHint,
    recentTypedText: snapshot.recentTypedText,
    recentClipboard: snapshot.recentClipboard,
    recentAppSwitches: snapshot.recentAppSwitches,
    coordinates: [],
  };

  try {
    const result = await ultraConverse({
      message:
        "[Proactive summon] User opened Specter without typing. Predict what they are doing right now and offer one helpful next step. Do not ask them to repeat context you already have.",
      mode: "ghostwiki",
      screenState,
      sessionHistory: [],
      memoryContext: combinedMemory || undefined,
    });

    const prediction =
      typeof result.reply === "string" && result.reply.trim()
        ? result.reply.trim()
        : fallbackPrediction(snapshot, resumePrompt, memoryContext);

    safeLog("[PROACTIVE] prediction ready", {
      appName: snapshot.appName,
      searchHint: snapshot.searchHint,
      hasMemory: Boolean(memoryContext),
    });

    return {
      ok: true,
      prediction,
      context: snapshot,
      resumePrompt,
      memoryContext,
    };
  } catch (error) {
    safeWarn("[PROACTIVE] ultraConverse failed; using fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: true,
      prediction: fallbackPrediction(snapshot, resumePrompt, memoryContext),
      context: snapshot,
      resumePrompt,
      memoryContext,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
