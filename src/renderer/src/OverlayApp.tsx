import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { api } from "./api";
import { GhostCursor } from "../overlay/GhostCursor";
import { GhostActionPlayer } from "../overlay/GhostActionPlayer";
import { WalkthroughGuide } from "../overlay/WalkthroughGuide";
import { SpecBuddy } from "../overlay/SpecBuddy";
import { ModeToggle } from "../overlay/ModeToggle";
import { SessionPanel } from "../overlay/SessionPanel";
import { ProgressTracker, type AgentActionEvent } from "../overlay/ProgressTracker";
import { SpecterWorkflowButton } from "../overlay/SpecterWorkflowButton";
import {
  buildStepHistory,
  computeStepProgress,
  markCompletedUpTo,
  upsertStepInstruction,
} from "../overlay/stepHistory";

import { GhostWikiPanel } from "../overlay/GhostWikiPanel";

import { UltraState } from "../overlay/UltraReplyBubble";
import { TargetPreviewGhost } from "../overlay/TargetPreviewGhost";
import { usePerimeterRoam } from "../overlay/usePerimeterRoam";
import { VoiceMicButton } from "../overlay/VoiceMicButton";
import { buildReasoningLines } from "../overlay/buildReasoningLines";
import { shouldAcceptAmbientTranscript } from "../overlay/transcriptFilter";
import type {
  BehavioralCheckpoint,
  BehavioralDiff,
  BehavioralState,
  SpecMood,
} from "../../main/session/types";

type SpecterMode = "silent" | "ultra" | "ghostwiki";
type ReplayState = "idle" | "running" | "paused";
type ReplayMode = "walkthrough" | "auto" | null;
type AutomationMode = "auto" | "mirror" | "calibration" | "agent";
type RealAppAction = "click" | "type" | "scroll" | "wait";
type EdgeLightState = "hidden" | "summon" | "idle" | "walkthrough";
type MirrorFeedbackKind = "accept" | "override" | "hesitation" | "correction";
type CoordinateFrame = "viewport" | "capture" | "practice-window" | "manual";

interface RealAppTarget {
  id?: string;
  label: string;
  description?: string;
  x: number;
  y: number;
  viewportX?: number;
  viewportY?: number;
  confidence?: number;
  action?: RealAppAction;
  source?: "vision" | "manual";
  sourceFrame?: CoordinateFrame;
  coordinateFrame?: CoordinateFrame;
  rawTarget?: {
    x: number;
    y: number;
    coordinateFrame: CoordinateFrame;
  };
  captureMeta?: CaptureFrameMeta;
}

interface RealAppTargetsResult {
  app?: string;
  prompt?: string;
  microTask?: string;
  targets?: RealAppTarget[];
  needsConfirmation?: boolean;
  reason?: string;
  confidenceThreshold?: number;
  captureMeta?: CaptureFrameMeta;
  error?: string;
  fallbackAvailable?: boolean;
}

interface CaptureFrameMeta {
  imageWidth: number;
  imageHeight: number;
  displayBounds: { x: number; y: number; width: number; height: number };
  captureBounds: { x: number; y: number; width: number; height: number };
  overlayBounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  coordinateMode: string;
}

interface CoordinateMappingResult {
  percent?: { x: number; y: number };
  screenPoint?: { x: number; y: number };
  activeDisplay?: {
    id: number;
    bounds: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
  };
  coordinateMode?: string;
}

const SHOW_WALKTHROUGH_DEBUG = import.meta.env.DEV;
const DEFAULT_REAL_APP_PROMPT = "Teach me one visible action";
const DEFAULT_CONFIDENCE_THRESHOLD = 0.65;
const NORMAL_TARGET_LIMIT = 3;
const DEBUG_TARGET_LIMIT = 10;
const CURSOR_REVEAL_POLL_MS = 70;
const NEAR_TARGET_REVEAL_DISTANCE_PX = 180;
const IDLE_REVEAL_RADIUS = 110;
const WALKTHROUGH_REVEAL_RADIUS = 150;
const NEAR_TARGET_REVEAL_RADIUS = 210;
const IDLE_REVEAL_STRENGTH = 0.28;
const WALKTHROUGH_REVEAL_STRENGTH = 0.48;
const NEAR_TARGET_REVEAL_STRENGTH = 0.72;

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Specter hit a temporary issue. Try again.";
}

function isNoteHtmlCompilationIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  const asksForNotes = /\b(epic|notes?|note list)\b/.test(normalized);
  const asksForOutput =
    /\b(html|hpi|llm|summary|summari[sz]e|synthesis|synthesi[sz]e|draft)\b/.test(
      normalized,
    );
  const asksForAgentAction =
    /\b(copy|compile|generate|open|capture|export|summari[sz]e|synthesi[sz]e|draft)\b/.test(
      normalized,
    );
  return asksForNotes && asksForOutput && asksForAgentAction;
}

async function confirmAutomationGate(
  mode: AutomationMode,
  steps = 500,
): Promise<void> {
  const token = await api.requestAutomationSession(mode, steps);
  const confirmed = await api.confirmAutomationSession(token);
  if (!confirmed) {
    throw new Error("Automation confirmation failed.");
  }
}

function finitePercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : null;
}

function cursorTargetDistancePx(
  cursorX: number,
  cursorY: number,
  targetX: number,
  targetY: number,
): number {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  return Math.hypot(
    ((cursorX - targetX) / 100) * width,
    ((cursorY - targetY) / 100) * height,
  );
}

function cursorRevealTuning(
  isWalkthroughActive: boolean,
  targetDistancePx: number | null,
) {
  const nearTargetFactor =
    targetDistancePx === null
      ? 0
      : Math.max(
          0,
          Math.min(1, 1 - targetDistancePx / NEAR_TARGET_REVEAL_DISTANCE_PX),
        );
  const baseRadius = isWalkthroughActive
    ? WALKTHROUGH_REVEAL_RADIUS
    : IDLE_REVEAL_RADIUS;
  const baseStrength = isWalkthroughActive
    ? WALKTHROUGH_REVEAL_STRENGTH
    : IDLE_REVEAL_STRENGTH;
  const radius = Math.round(
    baseRadius + (NEAR_TARGET_REVEAL_RADIUS - baseRadius) * nearTargetFactor,
  );
  const strength =
    baseStrength +
    (NEAR_TARGET_REVEAL_STRENGTH - baseStrength) * nearTargetFactor;

  return {
    nearTargetFactor,
    radius,
    strength,
  };
}

function formatCoordinate(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(1)
    : "?";
}

function confidencePercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function realAppTargetKey(target: RealAppTarget): string {
  return [
    target.source || "vision",
    target.id || target.label,
    formatCoordinate(target.x),
    formatCoordinate(target.y),
  ].join(":");
}

function sameRealAppTarget(
  first: RealAppTarget | null | undefined,
  second: RealAppTarget | null | undefined,
): boolean {
  if (!first || !second) return false;
  return realAppTargetKey(first) === realAppTargetKey(second);
}

function behaviorPercent(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`
    : "n/a";
}

function signedBehaviorPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  const rounded = Math.round(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function latestCheckpoint(
  checkpoints: BehavioralCheckpoint[],
): BehavioralCheckpoint | null {
  return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
}

function firstCheckpoint(
  checkpoints: BehavioralCheckpoint[],
): BehavioralCheckpoint | null {
  return checkpoints.length > 0 ? checkpoints[0] : null;
}

function formatAIHealthStatus(health: any): string {
  const anthropic = health?.anthropic || {};
  const anthropicKey = anthropic.key || {};
  const testRequest = anthropic.testRequest || {};
  const gemini = health?.gemini || {};
  const geminiKey = gemini.key || {};
  const elevenlabs = health?.elevenlabs || {};
  const elevenlabsKey = elevenlabs.key || {};
  const geminiTTS = health?.geminiTTS || {};
  const overall = health?.overall || {};

  const claudeTextStatus = testRequest.pass
    ? "Claude text test: pass"
    : `Claude text test: failed (${testRequest.category || "unknown"})`;
  const claudeVisionStatus = `Claude vision/config: ${anthropic.configured ? "ready" : "not configured"}`;
  const whisperStatus = `Voice input (Gemini): ${gemini.transcribeConfigured ? "ready" : "missing key"}`;
  const elevenlabsStatus = `ElevenLabs TTS: ${elevenlabs.configured ? "ready" : "fallback mode"}`;
  const geminiTTSStatus = `Gemini TTS: ${geminiTTS.configured ? "ready" : "not configured"}`;

  const overallAppAI = overall.readyForRealAppAI ? "ready" : "not ready";
  const overallVoiceInput = overall.readyForVoiceInput ? "ready" : "not ready";
  const overallVoiceOutput = overall.readyForNaturalVoiceOutput
    ? overall.naturalVoiceConfiguredOnly
      ? "Configured (test required)"
      : "Natural"
    : "macOS say";
  const reason = testRequest.reason ? `\nReason: ${testRequest.reason}` : "";

  return [
    `Real-app AI: ${overallAppAI}`,
    `Voice Input: ${overallVoiceInput} | Voice Output: ${overallVoiceOutput}`,
    claudeTextStatus,
    claudeVisionStatus,
    `Planner: ${anthropic.plannerModel || "unknown"}, Vision: ${anthropic.visionModel || "unknown"}`,
    whisperStatus,
    elevenlabsStatus,
    geminiTTSStatus,
    `Voice: ${elevenlabs.voiceId || "default"}, Model: ${elevenlabs.modelId || "default"}`,
    `ANTHROPIC_API_KEY: ${anthropicKey.present ? "present" : "missing"}, len: ${anthropicKey.keyLength || 0}, placeholder: ${anthropicKey.placeholderDetected ? "true" : "false"}`,
    `GEMINI_API_KEY: ${geminiKey.present ? "present" : "missing"}, len: ${geminiKey.keyLength || 0}, placeholder: ${geminiKey.placeholderDetected ? "true" : "false"}`,
    `ELEVENLABS_API_KEY: ${elevenlabsKey.present ? "present" : "missing"}, len: ${elevenlabsKey.keyLength || 0}, placeholder: ${elevenlabsKey.placeholderDetected ? "true" : "false"}`,
    `Local model: ${anthropic.useLocalModel ? "enabled" : "disabled"}, base: ${anthropic.baseURLKind || "unknown"}${reason}`,
  ].join("\n");
}

function realAppInstruction(target: RealAppTarget): string {
  const label = target.label || "target";
  if (target.action === "type") return `Move to ${label}.`;
  if (target.action === "scroll") return `Scroll near ${label}.`;
  if (target.action === "wait") return `Watch ${label}.`;
  return `Click ${label}.`;
}

function normalizedRealAppTarget(target: RealAppTarget): RealAppTarget {
  const source = target.source === "manual" ? "manual" : "vision";
  const x =
    typeof target.x === "number" && Number.isFinite(target.x)
      ? Math.min(100, Math.max(0, target.x))
      : 50;
  const y =
    typeof target.y === "number" && Number.isFinite(target.y)
      ? Math.min(100, Math.max(0, target.y))
      : 50;
  const viewportX =
    typeof target.viewportX === "number" && Number.isFinite(target.viewportX)
      ? Math.min(100, Math.max(0, target.viewportX))
      : x;
  const viewportY =
    typeof target.viewportY === "number" && Number.isFinite(target.viewportY)
      ? Math.min(100, Math.max(0, target.viewportY))
      : y;

  return {
    ...target,
    label: target.label?.trim() || "Selected target",
    x: viewportX,
    y: viewportY,
    viewportX,
    viewportY,
    confidence:
      typeof target.confidence === "number" &&
      Number.isFinite(target.confidence)
        ? Math.min(1, Math.max(0, target.confidence))
        : source === "manual"
          ? 1
          : undefined,
    action: ["click", "type", "scroll", "wait"].includes(target.action || "")
      ? target.action
      : "click",
    source,
    sourceFrame:
      target.sourceFrame ||
      (source === "manual" ? "manual" : target.coordinateFrame || "viewport"),
    coordinateFrame: "viewport",
  };
}

// Questions like "how do I create an automation?" should answer AND show the
// ghost walking the saved workflow, even when the model stays conversational.
const HOW_TO_PATTERN =
  /\b(how (do|can|would|should) (i|you|we)\b|how to\b|where (do|can) (i|you|we)\b|show me\b|walk me through\b|guide me\b|teach me\b)/i;

function walkthroughStepFromReplay(data: any) {
  return {
    ...data.step,
    index: data.index,
    total: data.total,
    retryReason: data.reason,
    ghostLocked: false,
    ghostReplayKey: `${data.index}:${data.attempt ?? 0}`,
  };
}

const OverlayApp: React.FC = () => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mode, setMode] = useState<SpecterMode>("silent");
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [intent, setIntent] = useState("");

  useEffect(() => {
    const fetchMode = async () => {
      try {
        const startupMode = await api.getStartupMode();
        // Demo presentation: voice + reasoning bubbles, no chat HUD.
        if (startupMode === "ghostwiki") {
          setMode("silent");
          setDemoPresentationMode(true);
        } else if (startupMode === "ultra") {
          setMode("ultra");
          setDemoPresentationMode(false);
        }
      } catch (err) {
        console.error("Failed to get startup mode", err);
      }
    };
    fetchMode();
  }, []);
  const [currentStep, setCurrentStep] = useState<any>(null);
  const [replayState, setReplayState] = useState<ReplayState>("idle");
  const [replayMode, setReplayMode] = useState<ReplayMode>(null);
  const [agentActions, setAgentActions] = useState<AgentActionEvent[]>([]);
  const [guideReady, setGuideReady] = useState(false);
  const guideReadyTimerRef = useRef<number | null>(null);
  const [liveGhostStep, setLiveGhostStep] = useState<any>(null);
  const [liveGhostLeaving, setLiveGhostLeaving] = useState(false);
  const liveGhostTimeoutRef = useRef<number | null>(null);
  const liveGhostLeaveTimerRef = useRef<number | null>(null);
  // Monotonic question id — a slow Q1 response must not overwrite Q2's ghost.
  const converseGenRef = useRef(0);

  const [ultraState, setUltraState] = useState<UltraState>("idle");
  const [ultraSessionHistory, setUltraSessionHistory] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(
    "Analyzing your screen...",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [lastNodeId, setLastNodeId] = useState("");
  const [manualConfirmMessage, setManualConfirmMessage] = useState("");
  const [calibrationMessage, setCalibrationMessage] = useState("");
  const [agentStatusMessage, setAgentStatusMessage] = useState("");
  const [realAppIntent, setRealAppIntent] = useState("");
  const [realAppTargets, setRealAppTargets] =
    useState<RealAppTargetsResult | null>(null);
  const [selectedRealAppTarget, setSelectedRealAppTarget] =
    useState<RealAppTarget | null>(null);
  const [selectedTargetMapping, setSelectedTargetMapping] =
    useState<CoordinateMappingResult | null>(null);
  const [isManualTargetPicking, setIsManualTargetPicking] = useState(false);
  const [manualPickPoint, setManualPickPoint] = useState({ x: 0, y: 0 });
  const [hoveredRealAppTargetKey, setHoveredRealAppTargetKey] =
    useState<string>("");
  const [previewGhostStart, setPreviewGhostStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [realAppNotice, setRealAppNotice] = useState("");
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [aiHealthMessage, setAiHealthMessage] = useState("");
  const [aiHealthPills, setAiHealthPills] = useState<any>(null);
  const [specMood, setSpecMood] = useState<SpecMood>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const ghostListenAbortRef = useRef<{ cancelled: boolean } | null>(null);
  const [behavioralState, setBehavioralState] =
    useState<BehavioralState | null>(null);
  const [behaviorCheckpoints, setBehaviorCheckpoints] = useState<
    BehavioralCheckpoint[]
  >([]);
  const [hasCompletedWalkthrough, setHasCompletedWalkthrough] = useState(false);
  const [railExpanded, setRailExpanded] = useState(true);
  const [stepInstructions, setStepInstructions] = useState<Map<number, string>>(
    new Map(),
  );
  const [correctedStepIndices, setCorrectedStepIndices] = useState<Set<number>>(
    new Set(),
  );
  const [completedStepIndices, setCompletedStepIndices] = useState<Set<number>>(
    new Set(),
  );
  const [sessionStepTotal, setSessionStepTotal] = useState(0);
  const [sessionCurrentIndex, setSessionCurrentIndex] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [activeCheckpoint, setActiveCheckpoint] =
    useState<BehavioralCheckpoint | null>(null);
  const [blendedPreview, setBlendedPreview] = useState<BehavioralState | null>(
    null,
  );
  const [behaviorDiff, setBehaviorDiff] = useState<BehavioralDiff | null>(null);
  const [blendT, setBlendT] = useState(1);
  const [mirrorStatus, setMirrorStatus] = useState<
    "idle" | "running" | "complete" | "error"
  >("idle");
  const [mirrorFeedbackStatus, setMirrorFeedbackStatus] = useState("");
  const [mirrorFeedbackArm, setMirrorFeedbackArm] = useState<string | null>(
    null,
  );
  const [mirrorCorrectionCount, setMirrorCorrectionCount] = useState(0);
  const [pitchMode, setPitchMode] = useState(false);
  const [demoPresentationMode, setDemoPresentationMode] = useState(true);
  const [contextReadActive, setContextReadActive] = useState(false);
  const [memorySearchActive, setMemorySearchActive] = useState(false);
  const [lastTTSProvider, setLastTTSProvider] = useState<
    "elevenlabs" | "gemini" | "macos" | null
  >(null);
  const [screenState, setScreenState] = useState<any>(null);
  // No text input remains — voice only. Kept as a constant so the
  // click-through guard logic stays intact.
  const [isInputFocused] = useState(false);
  const [isClickThrough, setIsClickThrough] = useState(true);
  // Rail is fixed to the right edge now; HUD dragging is retired.
  const [isHudDragging] = useState(false);
  const [summonSettled, setSummonSettled] = useState(false);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const isHudHoveredRef = useRef(false);
  const isHudDraggingRef = useRef(false);
  const isInputFocusedRef = useRef(false);
  const roamingGhostPosRef = useRef({ x: 50, y: 50 });

  const isReplayActiveForRoam =
    replayState === "running" || mirrorStatus === "running";
  const roamShowWorkflowCard =
    (Boolean(realAppTargets?.fallbackAvailable) ||
      Boolean(
        realAppTargets || selectedRealAppTarget || isManualTargetPicking,
      )) &&
    !isManualTargetPicking;
  const specBuddyRoamEnabled =
    (isVisible || isReplayActiveForRoam || isLoading) &&
    !(roamShowWorkflowCard && selectedRealAppTarget && !isReplayActiveForRoam);
  const specBuddyRoam = usePerimeterRoam(
    specBuddyRoamEnabled,
    '[data-specter-boundary="true"]',
    { ghostSize: 56, avoidBottomCenter: true },
  );

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0 || specBuddyRoam.x <= -500) return;
    roamingGhostPosRef.current = {
      x: (specBuddyRoam.x / w) * 100,
      y: (specBuddyRoam.y / h) * 100,
    };
  }, [specBuddyRoam.x, specBuddyRoam.y]);

  const modeRef = useRef(mode);
  const demoPresentationRef = useRef(demoPresentationMode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    demoPresentationRef.current = demoPresentationMode;
  }, [demoPresentationMode]);

  const setInteractivity = (interactive: boolean) => {
    // Only go click-through if mouse is out AND input is not focused
    if (!interactive && (isInputFocusedRef.current || isHudDraggingRef.current))
      return;
    const next = !interactive;
    setIsClickThrough(next);
    void api.setOverlayClickThrough(next);
  };

  const cancelGhostListen = useCallback(() => {
    if (ghostListenAbortRef.current) {
      ghostListenAbortRef.current.cancelled = true;
      ghostListenAbortRef.current = null;
    }
  }, []);

  // Hands-free listener. Tuned so real questions survive and ambient noise
  // doesn't: the utterance clock starts at first detected speech (not at
  // listen start), a thinking pause doesn't cut the user off, and transcripts
  // must pass the hallucination filter before they count as user input —
  // Whisper invents phrases like "Thank you." on silence, which is what made
  // the ghost talk to nobody.
  const ghostAutoListen = async (): Promise<void> => {
    if (modeRef.current !== "ultra" && !demoPresentationRef.current) {
      setUltraState("waitingForUser");
      return;
    }

    cancelGhostListen();
    const listenCtx = { cancelled: false };
    ghostListenAbortRef.current = listenCtx;
    setUltraState("listening");

    const { MicRecorder } = await import("../overlay/MicRecorder");
    const recorder = new MicRecorder();

    const POLL_MS = 150;
    const SILENCE_CONFIRM_MS = 1500;
    const MAX_LEAD_SILENCE_MS = 8000;
    const MAX_UTTERANCE_MS = 20_000;
    const startedAt = Date.now();
    let speechStartAt: number | null = null;
    let voicedMs = 0;
    let silenceStartAt: number | null = null;

    try {
      await recorder.start();
    } catch {
      ghostListenAbortRef.current = null;
      setUltraState("waitingForUser");
      return;
    }

    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        const now = Date.now();
        if (
          listenCtx.cancelled ||
          (!speechStartAt && now - startedAt >= MAX_LEAD_SILENCE_MS) ||
          (speechStartAt && now - speechStartAt >= MAX_UTTERANCE_MS)
        ) {
          clearInterval(poll);
          resolve();
          return;
        }
        const levels = recorder.getAudioLevels();
        if (levels && levels.length > 0) {
          // Use peak value rather than average — much more reliable for speech detection.
          // Frequency bins during speech will have several bins with high energy (200+),
          // while ambient noise stays mostly under 60 across all bins.
          let peak = 0;
          for (let i = 0; i < levels.length; i++) {
            if (levels[i] > peak) peak = levels[i];
          }
          // Peak > 80 reliably indicates speech on most microphones in most environments.
          // Much more robust than averaging which gets pulled down by silent bins.
          if (peak > 80) {
            if (!speechStartAt) speechStartAt = now;
            voicedMs += POLL_MS;
            silenceStartAt = null;
          } else if (speechStartAt) {
            if (!silenceStartAt) silenceStartAt = now;
            else if (now - silenceStartAt >= SILENCE_CONFIRM_MS) {
              clearInterval(poll);
              resolve();
            }
          }
        }
      }, POLL_MS);
    });

    if (listenCtx.cancelled) {
      await recorder.stop().catch(() => {});
      return;
    }

    const buffer = await recorder.stop().catch(() => new ArrayBuffer(0));

    if (!buffer.byteLength || !speechStartAt) {
      ghostListenAbortRef.current = null;
      setUltraState("waitingForUser");
      return;
    }

    setUltraState("transcribing");
    const transcribeResult = await (window as any).api
      .transcribe(buffer)
      .catch(() => ({ ok: false }));

    if (listenCtx.cancelled) return;
    ghostListenAbortRef.current = null;

    const spokenText =
      transcribeResult?.ok && typeof transcribeResult.text === "string"
        ? transcribeResult.text.trim()
        : "";

    if (spokenText && shouldAcceptAmbientTranscript(spokenText, voicedMs)) {
      await handleUltraSpokenInput(spokenText);
    } else {
      if (spokenText) {
        console.log("[LISTEN] discarded ambient transcript", {
          spokenText,
          voicedMs,
        });
      }
      setUltraState("waitingForUser");
    }
  };

  const speakIfUltra = (text: string, moment: string) => {
    const currentMode = modeRef.current;
    const demoMode = demoPresentationRef.current;
    console.log("[MODE] current mode", { mode: currentMode, moment, demoMode });
    if (currentMode === "ultra" || demoMode) {
      setUltraState("speaking");
      const timeout = setTimeout(() => {
        console.warn("[TTS] speak timeout");
        cancelGhostListen();
        setUltraState("waitingForUser");
      }, 20_000);

      setIsSpeaking(true);
      cancelGhostListen();
      void api
        .speak(text)
        .then((result: any) => {
          setIsSpeaking(false);
          clearTimeout(timeout);
          if (result?.providerUsed) {
            setLastTTSProvider(result.providerUsed);
          }
          if (result?.providerUsed === "macos" && result?.fallbackReason) {
            console.warn("[TTS] used macOS fallback", result.fallbackReason);
          } else if (result?.providerUsed === "gemini") {
            console.log("[TTS] used Gemini fallback");
          }
          void ghostAutoListen();
        })
        .catch((error: unknown) => {
          setIsSpeaking(false);
          clearTimeout(timeout);
          console.error("[TTS] error fallback", error);
          setLastTTSProvider("macos");
          setUltraState("waitingForUser");
        });
      return;
    }
    console.log("[ULTRA] skipped because silent mode");
    api.stopSpeaking().catch(() => undefined);
  };

  const logTargetCoordinateAlignment = async (
    target: RealAppTarget,
    context: "target selected" | "manual target picked" | "walkthrough start",
  ): Promise<CoordinateMappingResult | null> => {
    const overlayViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    try {
      const mapping = await api.mapPercentToScreen?.({
        x: target.x,
        y: target.y,
      });
      const details = {
        label: target.label,
        sourceFrame: target.sourceFrame,
        coordinateFrame: target.coordinateFrame || "viewport",
        rawTarget: target.rawTarget,
        normalizedViewport: {
          x: target.viewportX ?? target.x,
          y: target.viewportY ?? target.y,
        },
        confidence: target.confidence,
        source: target.source,
        action: target.action,
        captureBounds: target.captureMeta?.captureBounds,
        captureDisplayBounds: target.captureMeta?.displayBounds,
        mappedDisplayBounds: mapping?.activeDisplay?.bounds,
        activeDisplay: mapping?.activeDisplay,
        overlayViewport,
        expectedScreenPixel: mapping?.screenPoint,
        coordinateMode: mapping?.coordinateMode,
        context,
      };

      console.log("[COORD_ALIGNMENT] target mapping", details);
      console.log("[COORD_FRAME] normalized target", details);
      if (context === "walkthrough start") {
        console.log("[COORD_FRAME] ghost endpoint", details);
      }
      if (context !== "walkthrough start") {
        console.log("[REAL_APP_FLOW] target selected", details);
        setSelectedTargetMapping(mapping || null);
      }
      return mapping || null;
    } catch (error) {
      console.warn("[COORD_ALIGNMENT] target mapping failed", {
        label: target.label,
        sourceFrame: target.sourceFrame,
        rawTarget: target.rawTarget,
        normalizedViewport: {
          x: target.viewportX ?? target.x,
          y: target.viewportY ?? target.y,
        },
        overlayViewport,
        context,
        error,
      });
      if (context !== "walkthrough start") setSelectedTargetMapping(null);
      return null;
    }
  };

  const computePreviewGhostStart = async (): Promise<{
    x: number;
    y: number;
  }> => {
    try {
      const cursorPos = api.getCursorPercent
        ? await api.getCursorPercent()
        : null;
      const cursorX = finitePercent(cursorPos?.x);
      const cursorY = finitePercent(cursorPos?.y);
      if (cursorX !== null && cursorY !== null) {
        return { x: cursorX, y: cursorY };
      }
    } catch {
      // fall through
    }

    const hud = hudRef.current;
    if (hud) {
      const rect = hud.getBoundingClientRect();
      return {
        x: ((rect.left + rect.width / 2) / window.innerWidth) * 100,
        y: ((rect.top + rect.height / 2) / window.innerHeight) * 100,
      };
    }

    return { x: 50, y: 50 };
  };

  const clearLiveGhost = (immediate = true) => {
    if (liveGhostTimeoutRef.current) {
      window.clearTimeout(liveGhostTimeoutRef.current);
      liveGhostTimeoutRef.current = null;
    }
    if (liveGhostLeaveTimerRef.current) {
      window.clearTimeout(liveGhostLeaveTimerRef.current);
      liveGhostLeaveTimerRef.current = null;
    }
    if (immediate) {
      setLiveGhostLeaving(false);
      setLiveGhostStep(null);
    }
  };

  const scheduleLiveGhostDismiss = () => {
    if (liveGhostTimeoutRef.current) {
      window.clearTimeout(liveGhostTimeoutRef.current);
    }
    if (liveGhostLeaveTimerRef.current) {
      window.clearTimeout(liveGhostLeaveTimerRef.current);
      liveGhostLeaveTimerRef.current = null;
    }
    liveGhostTimeoutRef.current = window.setTimeout(() => {
      liveGhostTimeoutRef.current = null;
      setLiveGhostLeaving(true);
      liveGhostLeaveTimerRef.current = window.setTimeout(() => {
        setLiveGhostStep(null);
        setLiveGhostLeaving(false);
        liveGhostLeaveTimerRef.current = null;
      }, 200);
    }, 12_000);
  };

  const applyLiveTargetFromResult = async (result: any) => {
    if (result?.liveTargetUnresolved) {
      const label = String(result.liveTargetUnresolved);
      console.warn("[LIVE_GHOST] unresolved target", { label });
      setErrorMessage(
        `Couldn't highlight "${label}" — that control isn't visible in the current app window.`,
      );
      return;
    }
    if (!result?.liveTarget) return;
    const resolved = await api.resolveLiveTarget(
      result.liveTarget.targetLabel,
      result.liveTarget.action,
    );
    if (!resolved) {
      console.warn("[LIVE_GHOST] resolve failed", {
        targetLabel: result.liveTarget.targetLabel,
      });
      setErrorMessage(
        `Couldn't highlight "${result.liveTarget.targetLabel}" on screen.`,
      );
      return;
    }
    setErrorMessage("");
    setLiveGhostLeaving(false);
    setLiveGhostStep({
      ...resolved,
      instruction: result.liveTarget.instruction,
      action: result.liveTarget.action,
      viewportX: resolved.viewportX,
      viewportY: resolved.viewportY,
    });
    scheduleLiveGhostDismiss();
  };

  // Demo-mode ghost walkthrough: replays the bundled demo workflow steps so
  // the ghost cursor visibly travels and points at each target. Passing an
  // empty nodeId makes the main process pick the latest session with steps.
  const startDemoWalkthrough = async () => {
    setErrorMessage("");
    setReplayMode("walkthrough");
    setReplayState("running");
    try {
      await api.walkthrough("");
    } catch (error) {
      console.error("[Overlay] demo walkthrough failed:", error);
      setErrorMessage(messageFromError(error));
      setReplayState("idle");
      setReplayMode(null);
    }
  };

  // Explicit "do it on screen" phrasing skips the chat round-trip and goes
  // straight to target detection; everything else is a conversation turn and
  // Claude decides whether to escalate to a walkthrough.
  const WALKTHROUGH_FAST_PATH =
    /^(walk me through|teach me|show me how|show me|guide me|demonstrate|help me (do|click|open|create|make))/i;

  const handleUltraSpokenInput = async (text: string) => {
    cancelGhostListen();
    // Voice is the only input surface — spoken input is always accepted.
    const requestedText = text.trim();
    if (!requestedText) return;

    // Fast paths that used to live on the typed-input handler now apply to
    // speech too: note compilation and explicit "do it on screen" phrasing.
    if (isNoteHtmlCompilationIntent(requestedText)) {
      await runNoteHtmlAgent(requestedText);
      return;
    }
    if (
      WALKTHROUGH_FAST_PATH.test(requestedText) &&
      !demoPresentationRef.current
    ) {
      await startRealAppTest(requestedText);
      return;
    }

    const gen = ++converseGenRef.current;
    clearLiveGhost();
    setUltraState("thinking");
    console.log("[ULTRA] user said", { text });

    // Show the user's turn immediately; the closure below still sends the
    // pre-append history to the model, so the current message isn't doubled.
    setUltraSessionHistory((prev) => [
      ...prev,
      { role: "user", content: text },
    ]);

    const timeout = setTimeout(() => {
      console.warn("[ULTRA] converse timeout");
      // Invalidate this generation so a late reply can't speak or rewrite
      // history after we've already told the user it timed out.
      converseGenRef.current++;
      setUltraState("waitingForUser");
      setErrorMessage("Tutor is taking too long to respond. Try again.");
      setUltraSessionHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "That took too long on my end — try asking again.",
        },
      ]);
    }, 20_000);

    setMemorySearchActive(true);
    const memoryPromise: Promise<string | null> = Promise.race([
      api
        .ghostwikiQuery(text)
        .then((res: any) =>
          res?.ok && typeof res.answer === "string" && res.answer.trim()
            ? String(res.answer).slice(0, 600)
            : null,
        )
        .catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);

    try {
      const memoryContext = await memoryPromise;
      setMemorySearchActive(false);
      const result = await api.ultraConverse({
        message: text,
        mode,
        currentGoal: intent,
        currentStep,
        screenState,
        sessionHistory: ultraSessionHistory,
        memoryContext,
      });
      clearTimeout(timeout);

      // Stale generation: a newer message or the timeout already took over.
      if (gen !== converseGenRef.current) return;

      console.log("[ULTRA] tutor reply", result);
      const reply =
        typeof result.reply === "string" && result.reply.trim()
          ? result.reply
          : "I didn't come up with a useful reply there. Ask me again?";

      setUltraSessionHistory((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);

      if (result.shouldSpeak || demoPresentationMode) {
        console.log("[TTS] speak called");
        speakIfUltra(reply, "tutor reply");
      } else {
        setUltraState("waitingForUser");
      }

      const wantsWalkthrough =
        result.intent === "start_walkthrough" ||
        result.shouldStartWalkthrough ||
        HOW_TO_PATTERN.test(text);
      if (wantsWalkthrough && !currentStep && replayState === "idle") {
        if (demoPresentationRef.current) {
          // Demo mode: replay the saved workflow so the ghost visibly moves.
          void startDemoWalkthrough();
        } else if (result.shouldStartWalkthrough && lastNodeId) {
          void replaySavedWorkflow("walkthrough");
        } else if (
          result.intent === "start_walkthrough" ||
          result.shouldStartWalkthrough
        ) {
          await startRealAppTest(text);
        }
      }

      if (gen === converseGenRef.current) {
        await applyLiveTargetFromResult(result);
      }
    } catch (error) {
      clearTimeout(timeout);
      setMemorySearchActive(false);
      console.error("[ULTRA] error", error);
      if (gen === converseGenRef.current) {
        setUltraSessionHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Something went wrong on my end — try that again.",
          },
        ]);
      }
      setUltraState("error");
      setTimeout(() => setUltraState("waitingForUser"), 3000);
    }
  };

  useEffect(() => {
    isInputFocusedRef.current = isInputFocused;
  }, [isInputFocused]);

  useEffect(() => {
    if (!isVisible) {
      setSummonSettled(false);
      return;
    }

    setSummonSettled(false);
    const timer = window.setTimeout(() => setSummonSettled(true), 1100);
    return () => window.clearTimeout(timer);
  }, [isVisible]);

  useEffect(() => {
    const shouldTrackCursor =
      isVisible ||
      replayState !== "idle" ||
      isLoading ||
      mirrorStatus === "running";
    if (!shouldTrackCursor) return;

    let isDisposed = false;
    let timer: number | null = null;
    let hasLoggedCursorError = false;

    const isWalkthroughActive =
      replayMode === "walkthrough" && replayState === "running";
    const revealTarget =
      isWalkthroughActive && currentStep ? currentStep : selectedRealAppTarget;
    const targetX = finitePercent(revealTarget?.x);
    const targetY = finitePercent(revealTarget?.y);

    const updateCursorReveal = async () => {
      try {
        const position = api.getCursorPercent
          ? await api.getCursorPercent()
          : null;
        const cursorX = finitePercent(position?.x);
        const cursorY = finitePercent(position?.y);
        const overlay = overlayRef.current;

        if (overlay && cursorX !== null && cursorY !== null) {
          const distancePx =
            targetX !== null && targetY !== null
              ? cursorTargetDistancePx(cursorX, cursorY, targetX, targetY)
              : null;
          const reveal = cursorRevealTuning(isWalkthroughActive, distancePx);
          const centerAlpha = Math.max(0.18, 1 - reveal.strength);
          const midAlpha = Math.min(1, centerAlpha + reveal.strength * 0.55);

          overlay.style.setProperty("--cursor-x", `${cursorX}vw`);
          overlay.style.setProperty("--cursor-y", `${cursorY}vh`);
          overlay.style.setProperty("--reveal-radius", `${reveal.radius}px`);
          overlay.style.setProperty(
            "--reveal-strength",
            reveal.strength.toFixed(3),
          );
          overlay.style.setProperty(
            "--reveal-center-alpha",
            centerAlpha.toFixed(3),
          );
          overlay.style.setProperty("--reveal-mid-alpha", midAlpha.toFixed(3));
          overlay.dataset.cursorReveal =
            reveal.nearTargetFactor > 0.35
              ? "near-target"
              : isWalkthroughActive
                ? "walkthrough"
                : "idle";
        }
      } catch (error) {
        if (!hasLoggedCursorError) {
          console.warn("[CURSOR_REVEAL] cursor tracking unavailable:", error);
          hasLoggedCursorError = true;
        }
      } finally {
        if (!isDisposed) {
          timer = window.setTimeout(
            updateCursorReveal,
            isWalkthroughActive ? 55 : CURSOR_REVEAL_POLL_MS,
          );
        }
      }
    };

    void updateCursorReveal();

    return () => {
      isDisposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    isVisible,
    isLoading,
    replayMode,
    replayState,
    currentStep?.x,
    currentStep?.y,
    selectedRealAppTarget?.x,
    selectedRealAppTarget?.y,
    mirrorStatus,
  ]);

  // Overlay visibility + replay lifecycle events
  useEffect(() => {
    // Main sends explicit visibility state (not a blind toggle) so renderer
    // state can never invert against the actual window — the old toggle
    // pattern desynced whenever main showed/hid the window on its own and
    // was one reason the ghost never appeared.
    const offToggle = api.onOverlayVisibility?.((data: any) => {
      setIsVisible(Boolean(data?.visible));
    });

    const offComplete = api.onReplayComplete(() => {
      setCurrentStep(null);
      setReplayState("idle");
      setReplayMode(null);
      setManualConfirmMessage("");
      setHasCompletedWalkthrough(true);
      setSessionComplete(true);
      setSessionStepTotal((total) => {
        if (total > 0) {
          setCompletedStepIndices(markCompletedUpTo(new Set(), total));
          setSessionCurrentIndex(total);
        }
        return total;
      });
      setRailExpanded(true);
      setSpecMood("celebrating");
      if (modeRef.current === "ultra") {
        setUltraState("idle");
      }
    });

    const offStopped = api.onReplayStopped(() => {
      setCurrentStep(null);
      setReplayState("idle");
      setReplayMode(null);
      setManualConfirmMessage("");
      setSessionComplete(false);
      setSpecMood("idle");
      if (modeRef.current === "ultra") {
        setUltraState("idle");
      }
    });

    const offConfirmNeeded = api.onReplayConfirmNeeded((data: any) => {
      setManualConfirmMessage(
        data?.message ||
          "Click not detected. Press Space to confirm this step.",
      );
      setSpecMood("judging");
      setIsLoading(false);
    });

    const offConfirmCleared = api.onReplayConfirmCleared(() => {
      setManualConfirmMessage("");
    });

    const offScreenDenied = api.onScreenPermissionDenied(() => {
      setErrorMessage(
        "Screen Recording permission is missing. Grant it in macOS Privacy settings, then retry.",
      );
      setSpecMood("stuck");
      setIsLoading(false);
    });

    return () => {
      offToggle?.();
      offComplete();
      offStopped();
      offConfirmNeeded();
      offConfirmCleared();
      offScreenDenied();
    };
  }, []);

  useEffect(() => {
    void api
      .behaviorGetState?.()
      .then((state: BehavioralState) => {
        if (!state) return;
        setBehavioralState(state);
        setSpecMood(state.moodLabel || "idle");
      })
      .catch((error: unknown) => {
        console.warn("[BEHAVIOR] state unavailable:", error);
      });

    void api
      .behaviorListCheckpoints?.()
      .then((checkpoints: BehavioralCheckpoint[]) => {
        const list = Array.isArray(checkpoints) ? checkpoints : [];
        setBehaviorCheckpoints(list);
        const current = latestCheckpoint(list);
        setActiveCheckpoint(current);
        if (current) {
          setBehavioralState(current.signature);
          setSpecMood(current.signature.moodLabel);
        }
      })
      .catch((error: unknown) => {
        console.warn("[BEHAVIOR] checkpoints unavailable:", error);
      });

    const offSpecState = api.onSpecState((state: BehavioralState) => {
      setBehavioralState(state);
      if (state?.moodLabel) setSpecMood(state.moodLabel);
      // Real frames are flowing, so a startup "missing permissions" banner
      // was a false alarm - clear it.
      setErrorMessage((prev) =>
        prev.toLowerCase().includes("permissions") ? "" : prev,
      );
    });
    const offSpecMood = api.onSpecMood((mood: SpecMood) => {
      setSpecMood(mood || "idle");
    });
    const offCheckpoint = api.onBehaviorCheckpointCreated(
      (checkpoint: BehavioralCheckpoint) => {
        if (!checkpoint) return;
        setActiveCheckpoint(checkpoint);
        setBehavioralState(checkpoint.signature);
        setSpecMood(checkpoint.signature.moodLabel || "celebrating");
        setBehaviorCheckpoints((current) => {
          const withoutDuplicate = current.filter(
            (item) => item.id !== checkpoint.id,
          );
          return [...withoutDuplicate, checkpoint].sort(
            (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
          );
        });
      },
    );
    const offMirrorStarted = api.onMirrorStarted((data: any) => {
      setMirrorStatus("running");
      setSpecMood("mirroring");
      if (data?.signature) setBehavioralState(data.signature);
    });
    const offMirrorComplete = api.onMirrorComplete(() => {
      setMirrorStatus("complete");
      setSpecMood("celebrating");
      setReplayState("idle");
      setReplayMode(null);
      setMirrorFeedbackStatus(
        "Compare the replay with what you would have done.",
      );
    });
    const offMirrorError = api.onMirrorError((data: any) => {
      setMirrorStatus("error");
      setSpecMood("stuck");
      setErrorMessage(data?.message || "Mirror Mode hit a snag.");
      setReplayState("idle");
      setReplayMode(null);
      setMirrorFeedbackStatus("");
    });
    const offPermWarn = api.onBehaviorPermissionsWarning?.((data: any) => {
      setErrorMessage(
        data?.message ||
          "Missing macOS permissions - grant Accessibility + Input Monitoring and restart.",
      );
      setSpecMood("stuck");
    });
    const offFocusInput = api.onFocusInput?.(() => {
      setInteractivity(true);
      window.dispatchEvent(new CustomEvent("specter:focus-input"));
    });

    return () => {
      offFocusInput?.();
      offSpecState();
      offSpecMood();
      offCheckpoint();
      offMirrorStarted();
      offMirrorComplete();
      offMirrorError();
      offPermWarn?.();
    };
  }, []);

  // Proactive context + prediction when overlay becomes visible
  useEffect(() => {
    if (!isVisible) {
      cancelGhostListen();
      setScreenState(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setUltraState("thinking");
      setContextReadActive(true);
      try {
        const predictionRes = await api.getProactivePrediction();
        if (cancelled) return;

        const snapshot = predictionRes?.context;
        if (snapshot) {
          setScreenState({
            app: snapshot.appName || "Unknown",
            windowTitle: snapshot.windowTitle,
            pageUrl: snapshot.pageUrl,
            searchHint: snapshot.searchHint,
            recentTypedText: snapshot.recentTypedText,
            coordinates: [],
          });
        }

        // The prediction is context, not conversation: show it silently and
        // start listening. Reading it aloud on every summon was the ghost
        // "randomly talking" before the user had said anything.
        const prediction = predictionRes?.prediction?.trim();
        if (prediction) {
          setUltraSessionHistory((prev) => {
            if (prev.length > 0) return prev;
            return [{ role: "assistant", content: prediction, proactive: true }];
          });
        }
        if (modeRef.current === "ultra" || demoPresentationRef.current) {
          void ghostAutoListen();
        } else {
          setUltraState("waitingForUser");
        }
      } catch (error) {
        console.error("[PROACTIVE] summon prediction failed", error);
        setScreenState({ app: "Unknown", coordinates: [] });
        setUltraState("waitingForUser");
      } finally {
        if (!cancelled) setContextReadActive(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isVisible]);

  useEffect(() => {
    if (isLoading) {
      setSpecMood("thinking");
    }
  }, [isLoading]);

  useEffect(() => {
    if (behaviorCheckpoints.length >= 2) {
      void refreshBehaviorDiff(
        firstCheckpoint(behaviorCheckpoints),
        latestCheckpoint(behaviorCheckpoints),
      );
    }
  }, [behaviorCheckpoints.length]);

  // Option + D to toggle debug tools
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowDebugTools((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || (!showDebugTools && !pitchMode)) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable)
        return;

      const key = event.key.toLowerCase();
      if (!["c", "b"].includes(key)) return;
      event.preventDefault();

      if (key === "c") void createBehaviorCheckpoint();
      if (key === "b") {
        void seedSpecDemo().then(() => {
          setBlendT(0.5);
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showDebugTools, pitchMode]);

  // Return to click-through if input is blurred and mouse is not over UI
  useEffect(() => {
    if (
      !isInputFocused &&
      !realAppTargets &&
      !selectedRealAppTarget &&
      !isManualTargetPicking
    ) {
      if (import.meta.env.VITE_DEBUG_VERBOSE === "true")
        console.log(
          "[OVERLAY_INTERACTION] input blurred, restoring click-through",
        );
      setInteractivity(false);
    }
  }, [
    isInputFocused,
    realAppTargets,
    selectedRealAppTarget,
    isManualTargetPicking,
  ]);

  useEffect(() => {
    if (!manualConfirmMessage) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      void api.confirmReplayStep().catch((error: unknown) => {
        console.error("[Overlay] Replay confirmation failed:", error);
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manualConfirmMessage]);

  useEffect(() => {
    if (!isManualTargetPicking) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelManualTargetPicking();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isManualTargetPicking, realAppTargets, selectedRealAppTarget]);

  useEffect(() => {
    const needsTargetInteraction = Boolean(
      realAppTargets || selectedRealAppTarget || isManualTargetPicking,
    );

    if (needsTargetInteraction) {
      setInteractivity(true);
      return;
    }

    if (
      !isInputFocusedRef.current &&
      !isHudHoveredRef.current &&
      !isHudDraggingRef.current
    ) {
      setInteractivity(false);
    }
  }, [realAppTargets, selectedRealAppTarget, isManualTargetPicking]);

  useEffect(() => {
    if (!realAppTargets || replayState === "running") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      startManualTargetPicking();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [realAppTargets, replayState]);

  useEffect(() => {
    const isGhostActionReplay =
      replayState === "running" &&
      currentStep &&
      (replayMode === "walkthrough" || replayMode === "auto");
    const replayActive =
      replayState === "running" || mirrorStatus === "running";
    const isLiveGhost = !replayActive && Boolean(liveGhostStep);
    const guideStep = isGhostActionReplay
      ? currentStep
      : isLiveGhost
        ? liveGhostStep
        : null;
    const stepX = guideStep?.viewportX ?? guideStep?.x;
    const stepY = guideStep?.viewportY ?? guideStep?.y;
    const shouldDelayGuide = isGhostActionReplay || isLiveGhost;

    if (guideReadyTimerRef.current) {
      window.clearTimeout(guideReadyTimerRef.current);
      guideReadyTimerRef.current = null;
    }

    if (!shouldDelayGuide || stepX == null || stepY == null) {
      setGuideReady(!shouldDelayGuide);
      return;
    }

    setGuideReady(false);
    // 50ms enter-frame paint + 550ms travel = ring reveals on arrival
    guideReadyTimerRef.current = window.setTimeout(() => {
      setGuideReady(true);
      guideReadyTimerRef.current = null;
    }, 620);

    return () => {
      if (guideReadyTimerRef.current) {
        window.clearTimeout(guideReadyTimerRef.current);
        guideReadyTimerRef.current = null;
      }
    };
  }, [
    // Coordinate primitives only — full step objects are recreated on
    // non-positional updates (e.g. ghostLocked flip on target reach) and
    // would reset the 620ms timer, blanking the ring mid-walkthrough.
    currentStep?.viewportX,
    currentStep?.x,
    currentStep?.viewportY,
    currentStep?.y,
    Boolean(currentStep),
    liveGhostStep?.viewportX,
    liveGhostStep?.x,
    liveGhostStep?.viewportY,
    liveGhostStep?.y,
    Boolean(liveGhostStep),
    replayState,
    replayMode,
    mirrorStatus,
  ]);

  // Listen for walkthrough step events (clears loading once first step fires)
  useEffect(() => {
    const offStep = api.onReplayStep((data: any) => {
      const step = walkthroughStepFromReplay(data);
      setCurrentStep(step);
      setReplayMode("walkthrough");
      setReplayState("running");
      setSessionComplete(false);
      setSessionStepTotal(data.total ?? step.total ?? 0);
      setSessionCurrentIndex(data.index ?? step.index ?? 0);
      setCompletedStepIndices((prev) =>
        markCompletedUpTo(prev, data.index ?? step.index ?? 0),
      );
      setRailExpanded(true);
      setIsLoading(false);
      setSpecMood("thinking");

      if (modeRef.current === "ultra") {
        speakIfUltra("Follow the ghost cursor.", "step start");
        setUltraState("guiding");
      }
    });

    const offRetry = api.onReplayRetry((data: any) => {
      const step = walkthroughStepFromReplay(data);
      setCurrentStep(step);
      setReplayMode("walkthrough");
      setReplayState("running");
      setSessionStepTotal(data.total ?? step.total ?? 0);
      setSessionCurrentIndex(data.index ?? step.index ?? 0);
      setIsLoading(false);
      setSpecMood("judging");
    });

    const offTargetReached = api.onReplayTargetReached((data: any) => {
      setCurrentStep((current: any) => {
        if (!current || current.index !== data.index) return current;
        return {
          ...current,
          ghostLocked: true,
        };
      });
      setSpecMood("flow");

      if (modeRef.current === "ultra") {
        speakIfUltra("Nice, you're close. Click when ready.", "target reached");
      }
    });

    return () => {
      offStep();
      offRetry();
      offTargetReached();
    };
  }, []);

  // Listen for auto-execute progress events
  useEffect(() => {
    const offProgress = api.onReplayProgress((data: any) => {
      setReplayState("running");
      setReplayMode("auto");
      setSessionComplete(false);
      setSessionStepTotal(data.total ?? 0);
      setSessionCurrentIndex(data.index ?? 0);
      setCompletedStepIndices((prev) =>
        markCompletedUpTo(prev, data.index ?? 0),
      );
      setRailExpanded(true);
      // Spread step coords so GhostActionPlayer can glide alongside the real
      // mouse; without x/y it renders nothing during auto/mirror replay.
      setCurrentStep(
        data.step
          ? walkthroughStepFromReplay(data)
          : { index: data.index, total: data.total },
      );
      setSpecMood(mirrorStatus === "running" ? "mirroring" : "thinking");
    });

    return () => {
      offProgress();
    };
  }, [mirrorStatus]);

  // Live agent-action feed for the right rail
  useEffect(() => {
    const offAction = api.onReplayAction?.((event: AgentActionEvent) => {
      setAgentActions((prev) => {
        const next = [...prev, event].slice(-20);
        return next;
      });
    });
    return () => offAction?.();
  }, []);

  const runLegacyPlannerFlow = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setIntent(trimmed);
    setErrorMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setSelectedTargetMapping(null);
    setHoveredRealAppTargetKey("");
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setLoadingMessage("Analyzing your screen...");
    setIsLoading(true);
    const startTime = Date.now();
    let selectedArm: string | null = null;

    try {
      const res = await api.analyzeScreen(undefined, {
        captureUnderlying: true,
      });
      if (res?.error === "AI_BACKEND_UNAVAILABLE") {
        setErrorMessage(
          "AI vision unavailable. Use Practice Mode, pick target manually, or check backend.",
        );
        setIsLoading(false);
        return;
      }
      setScreenState(res);

      setLoadingMessage("Planning the walkthrough...");
      const plan = await api.planSteps(trimmed, res, [], mode);
      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        throw new Error(
          "Specter could not create a usable plan for that intent.",
        );
      }

      const nodeId =
        typeof plan.levelTitle === "string" && plan.levelTitle.trim()
          ? plan.levelTitle
          : trimmed;
      setLastNodeId(nodeId);

      setLoadingMessage("Saving the workflow...");
      await api.saveNode(nodeId, plan.steps);

      speakIfUltra(`Starting: ${nodeId}`, "starting walkthrough");

      try {
        selectedArm = await api.selectStyle();
      } catch (error) {
        console.warn("[Overlay] Could not select teaching style:", error);
      }

      setLoadingMessage("Starting walkthrough...");
      setReplayMode("walkthrough");
      setReplayState("running");
      await api.walkthrough(nodeId);

      const elapsed = Date.now() - startTime;
      const reward = elapsed < 15000 ? 1 : elapsed < 45000 ? 0.5 : 0;
      if (selectedArm) {
        await api.recordReward(selectedArm, reward);
      }
      await api.markNodeComplete(nodeId);
      speakIfUltra("Walkthrough complete.", "walkthrough complete");
    } catch (error) {
      console.error("[Overlay] Intent submission failed:", error);
      setErrorMessage(messageFromError(error));
      setReplayState("idle");
      setReplayMode(null);
    } finally {
      setIsLoading(false);
    }
  };

  const replaySavedWorkflow = async (kind: Exclude<ReplayMode, null>) => {
    if (!lastNodeId) return;
    if (kind === "auto") {
      console.log("[AUTO_REAL_MOUSE] confirmation shown for auto-execute");
      if (!window.confirm("Specter will control your real mouse. Continue?")) {
        console.log("[AUTO_REAL_MOUSE] confirmation canceled");
        return;
      }
      console.log("[AUTO_REAL_MOUSE] confirmation accepted");
    }

    setErrorMessage("");
    setIsLoading(true);
    setLoadingMessage(
      kind === "walkthrough"
        ? "Starting walkthrough..."
        : "Starting auto-execute...",
    );
    setReplayMode(kind);
    setReplayState("running");
    setSessionComplete(false);
    setCompletedStepIndices(new Set());
    setCorrectedStepIndices(new Set());
    setSessionCurrentIndex(0);
    setSessionStepTotal(0);
    setRailExpanded(true);

    let automationArmed = false;
    try {
      if (kind === "walkthrough") {
        await api.walkthrough(lastNodeId);
      } else {
        await confirmAutomationGate("auto");
        automationArmed = true;
        await api.autoExecute(lastNodeId);
      }
    } catch (error) {
      console.error("[Overlay] Replay failed:", error);
      setErrorMessage(messageFromError(error));
      setReplayState("idle");
      setReplayMode(null);
    } finally {
      if (automationArmed) {
        await api.cancelAutomationSession().catch((error: unknown) => {
          console.warn("[AUTO_REAL_MOUSE] gate cancel failed:", error);
        });
      }
      setIsLoading(false);
    }
  };

  const prepareControlledDemo = async () => {
    setErrorMessage("");
    setCalibrationMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setSelectedTargetMapping(null);
    setHoveredRealAppTargetKey("");
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setIsLoading(true);
    setLoadingMessage("Preparing fallback practice...");

    try {
      const workflow = await api.prepareControlledDemo();
      setIntent(workflow.intent || "Controlled Specter demo");
      setLastNodeId(workflow.nodeId);
      setReplayState("idle");
      setReplayMode(null);
      setCurrentStep(null);
    } catch (error) {
      console.error("[Overlay] Demo workflow failed:", error);
      setErrorMessage(messageFromError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const runNoteHtmlAgent = async (text: string) => {
    const agentIntent =
      text.trim() ||
      intent.trim() ||
      "Epic Notes is already open. Open each visible note, copy the full note content, and synthesize one HPI with the LLM.";

    console.log("[NOTE_HTML_AGENT] confirmation shown");
    if (
      !window.confirm(
        "Specter will control your mouse, open Epic notes, copy note text, synthesize an HPI with the LLM, and write local files. Continue?",
      )
    ) {
      console.log("[NOTE_HTML_AGENT] confirmation canceled");
      return;
    }
    console.log("[NOTE_HTML_AGENT] confirmation accepted");

    setIntent(agentIntent);
    setRealAppIntent(agentIntent);
    setLastNodeId("");
    setCurrentStep(null);
    setReplayMode("auto");
    setReplayState("running");
    setErrorMessage("");
    setCalibrationMessage("");
    setAgentStatusMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setSelectedTargetMapping(null);
    setHoveredRealAppTargetKey("");
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setIsLoading(true);
    setLoadingMessage("Opening notes, copying text, and drafting HPI...");
    setSpecMood("thinking");

    let automationArmed = false;
    try {
      await confirmAutomationGate("agent", 50);
      automationArmed = true;
      const result = await api.compileNotesToHtml({ intent: agentIntent });
      const message = `Drafted HPI from ${result?.noteCount ?? 0} notes: ${result?.hpiPath || result?.htmlPath || "output file ready"}`;
      console.log("[NOTE_HTML_AGENT] completed", {
        htmlPath: result?.htmlPath,
        hpiPath: result?.hpiPath,
        noteCount: result?.noteCount,
        hpiLength:
          typeof result?.hpiText === "string" ? result.hpiText.length : 0,
      });
      setAgentStatusMessage(message);
      speakIfUltra("Done. I drafted the HPI from the notes.", "agent complete");
      setSpecMood("celebrating");
    } catch (error) {
      console.error("[NOTE_HTML_AGENT] failed:", error);
      setErrorMessage(messageFromError(error));
      setSpecMood("stuck");
    } finally {
      if (automationArmed) {
        await api.cancelAutomationSession().catch((error: unknown) => {
          console.warn("[NOTE_HTML_AGENT] gate cancel failed:", error);
        });
      }
      setReplayState("idle");
      setReplayMode(null);
      setIsLoading(false);
    }
  };

  const startRealAppTest = async (text: string) => {
    const testIntent = text.trim() || intent.trim() || DEFAULT_REAL_APP_PROMPT;

    setIntent(testIntent);
    setRealAppIntent(testIntent);
    setLastNodeId("");
    setCurrentStep(null);
    setReplayMode(null);
    setReplayState("idle");
    setErrorMessage("");
    setCalibrationMessage("");
    setAgentStatusMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setSelectedTargetMapping(null);
    setHoveredRealAppTargetKey("");
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setIsLoading(true);
    setLoadingMessage("Capturing real app...");

    try {
      const result = await api.detectRealAppTargets(testIntent);
      if (result?.error === "AI_BACKEND_UNAVAILABLE") {
        const msg =
          "I couldn't confidently detect the target. Pick it manually or use Practice Mode.";
        setRealAppTargets({
          error: "AI_BACKEND_UNAVAILABLE",
          fallbackAvailable: true,
          targets: [],
          microTask: msg,
          app: "Unavailable",
          confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
        });
        setSelectedRealAppTarget(null);
        setSelectedTargetMapping(null);
        setHoveredRealAppTargetKey("");
        setIsLoading(false);

        const fallbackReply =
          "I couldn't inspect the screen right now. Click something you want to learn, and the ghost cursor will guide you to it.";
        setUltraSessionHistory((prev) => [
          ...prev,
          { role: "assistant", content: fallbackReply },
        ]);
        setUltraState("waitingForUser");
        speakIfUltra(fallbackReply, "fallback");

        return;
      }
      const normalizedTargets = Array.isArray(result?.targets)
        ? result.targets.map((target: RealAppTarget) =>
            normalizedRealAppTarget(target),
          )
        : [];
      const nextTargets: RealAppTargetsResult = {
        ...result,
        targets: normalizedTargets,
        confidenceThreshold:
          typeof result?.confidenceThreshold === "number"
            ? result.confidenceThreshold
            : DEFAULT_CONFIDENCE_THRESHOLD,
      };
      const threshold =
        nextTargets.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;

      setRealAppTargets(nextTargets);
      setSelectedRealAppTarget(null);
      setSelectedTargetMapping(null);
      setHoveredRealAppTargetKey("");

      console.log("[SCREEN_TARGETS] candidate list", {
        prompt: testIntent,
        app: nextTargets.app,
        microTask: nextTargets.microTask,
        needsConfirmation: nextTargets.needsConfirmation,
        overlayViewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        candidates: normalizedTargets.map((target, index) => ({
          index,
          label: target.label,
          description: target.description,
          x: target.x,
          y: target.y,
          viewportX: target.viewportX,
          viewportY: target.viewportY,
          sourceFrame: target.sourceFrame,
          coordinateFrame: target.coordinateFrame,
          rawTarget: target.rawTarget,
          captureBounds: target.captureMeta?.captureBounds,
          displayBounds: target.captureMeta?.displayBounds,
          confidence: target.confidence,
          action: target.action,
          source: target.source,
        })),
      });

      if (normalizedTargets.length === 0) {
        setRealAppNotice(
          "I couldn't confidently see the target. Click the exact spot you want the ghost cursor to teach, or press Escape to cancel.",
        );
        setIsManualTargetPicking(true);
      } else {
        const leadTarget = normalizedTargets[0];
        speakIfUltra(
          `I found possible targets, starting with ${leadTarget.label}. Pick the right marker before we start.`,
          "target found",
        );
        setRealAppNotice(
          (leadTarget.confidence ?? 0) < threshold
            ? "These are best guesses. Pick manually if they look wrong."
            : "",
        );
      }
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const selectRealAppTarget = async (target: RealAppTarget) => {
    const normalized = normalizedRealAppTarget(target);
    setSelectedRealAppTarget(normalized);
    setHoveredRealAppTargetKey(realAppTargetKey(normalized));
    setIsManualTargetPicking(false);
    setRealAppNotice("");

    const start = await computePreviewGhostStart();
    setPreviewGhostStart(start);

    void logTargetCoordinateAlignment(normalized, "target selected");
  };

  const startManualTargetPicking = () => {
    console.log("[MANUAL_TARGET] manual target picking armed");
    setManualPickPoint({
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
    });
    setIsManualTargetPicking(true);
    setHoveredRealAppTargetKey("");
    setInteractivity(true);
    setRealAppNotice(
      "Click the exact spot you want the ghost cursor to teach. Press Escape to cancel.",
    );
  };

  const cancelManualTargetPicking = () => {
    setIsManualTargetPicking(false);
    setRealAppNotice("Manual target picking canceled.");
    if (!realAppTargets && !selectedRealAppTarget) setInteractivity(false);
  };

  const updateManualPickPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    setManualPickPoint({
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
    });
  };

  const handleManualTargetPick = async (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!isManualTargetPicking) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const fullViewportRect = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const target = normalizedRealAppTarget({
      id: "manual-real-app-target",
      label: "Manual target",
      description: "Chosen by developer during Real App Test",
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      confidence: 1,
      action: "click",
      source: "manual",
      sourceFrame: "manual",
      coordinateFrame: "viewport",
    });

    console.log("[REAL_APP_FLOW] manual target picked", {
      x: target.x,
      y: target.y,
      manualPickRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      fullViewportRect,
    });
    setSelectedRealAppTarget(target);
    setHoveredRealAppTargetKey(realAppTargetKey(target));
    void logTargetCoordinateAlignment(target, "manual target picked");

    const start = await computePreviewGhostStart();
    setPreviewGhostStart(start);

    setRealAppTargets((current) => ({
      ...(current || {
        app: "Manual",
        prompt: realAppIntent || intent || DEFAULT_REAL_APP_PROMPT,
        microTask: "First, I will teach one manually selected action.",
        needsConfirmation: true,
        confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      }),
      targets: [
        target,
        ...(current?.targets || []).filter((item) => item.source !== "manual"),
      ],
    }));
    setIsManualTargetPicking(false);
    setRealAppNotice("Manual target selected.");
  };

  const startRealAppWalkthrough = async () => {
    if (!selectedRealAppTarget) {
      setRealAppNotice("Pick or confirm a target first.");
      return;
    }

    const target = normalizedRealAppTarget(selectedRealAppTarget);
    const workflowInput = {
      intent: realAppIntent || intent || DEFAULT_REAL_APP_PROMPT,
      mode,
      microTask:
        realAppTargets?.microTask || "First, I will teach one visible action.",
      source: target.source,
      target: {
        ...target,
        instruction: realAppInstruction(target),
      },
    };

    setErrorMessage("");
    setIsLoading(true);
    setLoadingMessage("Starting real-app walkthrough...");

    try {
      console.log("[MODE] current mode", { mode, flow: "real-app" });
      await logTargetCoordinateAlignment(target, "walkthrough start");
      const workflow = await api.createRealAppWorkflow(workflowInput);
      const nodeId = workflow?.nodeId;
      if (!nodeId)
        throw new Error("Specter could not save the real-app walkthrough.");

      console.log("[REAL_APP_WALKTHROUGH] start from preview target", {
        label: target.label,
        x: target.x,
        y: target.y,
      });
      console.log("[REAL_APP_WALKTHROUGH] confirmed target", {
        nodeId,
        label: target.label,
        percent: { x: target.x, y: target.y },
        source: target.source,
        confidence: target.confidence,
        mode,
      });

      setLastNodeId(nodeId);
      setIntent(workflow?.intent || workflowInput.intent);
      speakIfUltra(
        `Starting walkthrough for ${target.label}.`,
        "starting walkthrough",
      );
      setReplayMode("walkthrough");
      setReplayState("running");
      await api.walkthrough(nodeId);
      await api.markNodeComplete(nodeId);
      setHasCompletedWalkthrough(true);
      speakIfUltra("Walkthrough complete.", "walkthrough complete");
      setRealAppTargets(null);
      setSelectedRealAppTarget(null);
      setSelectedTargetMapping(null);
      setHoveredRealAppTargetKey("");
      setRealAppNotice("");
    } catch (error) {
      console.error("[REAL_APP_WALKTHROUGH] failed:", error);
      setErrorMessage(messageFromError(error));
      setReplayState("idle");
      setReplayMode(null);
    } finally {
      setIsLoading(false);
    }
  };

  const runCoordinateCalibration = async () => {
    setErrorMessage("");
    try {
      const diagnostics = await api.getCursorCalibration();
      const percent = diagnostics?.computedPercent || {};
      const center = diagnostics?.toScreenPoint50_50 || {};
      const scale = diagnostics?.primaryDisplay?.scaleFactor;
      setCalibrationMessage(
        `Mouse ${formatCoordinate(percent.x)}, ${formatCoordinate(percent.y)} percent. Center maps to ${center.x ?? "?"}, ${center.y ?? "?"}. Scale ${scale ?? "?"}. Mode ${diagnostics?.coordinateMode || "unknown"}.`,
      );
    } catch (error) {
      console.error("[Overlay] Coordinate diagnostics failed:", error);
      setErrorMessage(messageFromError(error));
    }
  };

  const checkAIBackend = async () => {
    setErrorMessage("");
    setAiHealthMessage("Checking AI backend...");
    setAiHealthPills(null);

    try {
      const health = await api.healthCheck();
      console.log("[AI_BACKEND] health check", health);
      setAiHealthMessage(formatAIHealthStatus(health));
      setAiHealthPills(health);
    } catch (error) {
      console.error("[AI_BACKEND] health check failed:", error);
      setAiHealthMessage(`AI backend check failed: ${messageFromError(error)}`);
      setAiHealthPills(null);
    }
  };

  const moveCursorToScreenCenter = async () => {
    if (!window.confirm("Move your real mouse to the screen center?")) return;

    setErrorMessage("");
    try {
      await api.moveCursorToScreenCenter();
      setCalibrationMessage(
        "Center move requested. Verify the cursor landed at the visual center.",
      );
    } catch (error) {
      console.error("[Overlay] Center move failed:", error);
      setErrorMessage(messageFromError(error));
    }
  };

  const refreshBehaviorDiff = async (
    from: BehavioralCheckpoint | null,
    to: BehavioralCheckpoint | null,
  ) => {
    if (!from || !to || from.id === to.id) {
      setBehaviorDiff(null);
      return;
    }

    try {
      const diff = await api.behaviorDiffCheckpoints(from.id, to.id);
      setBehaviorDiff(diff || null);
    } catch (error) {
      console.warn("[BEHAVIOR] diff failed:", error);
      setBehaviorDiff(null);
    }
  };

  const seedSpecDemo = async () => {
    setErrorMessage("");
    try {
      const checkpoints = await api.behaviorSeedDemo();
      const list = Array.isArray(checkpoints) ? checkpoints : [];
      setBehaviorCheckpoints(list);
      const current = latestCheckpoint(list);
      setActiveCheckpoint(current);
      setBehavioralState(current?.signature || null);
      setSpecMood(current?.signature?.moodLabel || "celebrating");
      setBlendT(1);
      setBlendedPreview(null);
      setMirrorFeedbackStatus(
        "DEV FALLBACK: synthetic demo data loaded. Not learned behavior.",
      );
      await refreshBehaviorDiff(firstCheckpoint(list), latestCheckpoint(list));
    } catch (error) {
      console.error("[BEHAVIOR] seed demo failed:", error);
      setErrorMessage(messageFromError(error));
      setSpecMood("stuck");
    }
  };

  const createBehaviorCheckpoint = async () => {
    setErrorMessage("");
    try {
      const checkpoint = await api.behaviorCreateCheckpoint();
      if (!checkpoint) return;
      setActiveCheckpoint(checkpoint);
      setBehavioralState(checkpoint.signature);
      setSpecMood(checkpoint.signature?.moodLabel || "idle");
      setBehaviorCheckpoints((current) => {
        const list = [
          ...current.filter((item) => item.id !== checkpoint.id),
          checkpoint,
        ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
        void refreshBehaviorDiff(firstCheckpoint(list), latestCheckpoint(list));
        return list;
      });
    } catch (error) {
      console.error("[BEHAVIOR] checkpoint failed:", error);
      setErrorMessage(messageFromError(error));
      setSpecMood("stuck");
    }
  };

  const updateBlendPreview = async (value: number) => {
    setBlendT(value);
    const from = firstCheckpoint(behaviorCheckpoints);
    const to = latestCheckpoint(behaviorCheckpoints);
    if (!from || !to || from.id === to.id) return;

    try {
      const blended = await api.behaviorBlendCheckpoints(from.id, to.id, value);
      if (blended) {
        setBlendedPreview(blended);
        setBehavioralState(blended);
        setSpecMood(blended.moodLabel);
      }
      await refreshBehaviorDiff(from, to);
    } catch (error) {
      console.warn("[BEHAVIOR] blend failed:", error);
    }
  };

  const runMirrorMode = async () => {
    if (mirrorStatus === "running") return;
    if (
      !window.confirm(
        "Spec will control your real mouse in Mirror Mode. Continue?",
      )
    ) {
      return;
    }

    setErrorMessage("");
    setMirrorStatus("running");
    setReplayMode("auto");
    setReplayState("running");
    setSpecMood("mirroring");
    setMirrorFeedbackStatus("");
    setMirrorCorrectionCount(0);

    let automationArmed = false;
    try {
      await confirmAutomationGate("mirror");
      automationArmed = true;
      const arm = api.selectStyle
        ? await api.selectStyle().catch(() => null)
        : null;
      setMirrorFeedbackArm(typeof arm === "string" ? arm : "C");
      await api.runMirrorMode({
        nodeId: lastNodeId || undefined,
        task: intent || undefined,
        blendedSignature: blendedPreview || behavioralState || undefined,
        confirmed: true,
      });
    } catch (error) {
      console.error("[MIRROR_MODE] failed:", error);
      setErrorMessage(messageFromError(error));
      setMirrorStatus("error");
      setSpecMood("stuck");
      setReplayState("idle");
      setReplayMode(null);
    } finally {
      if (automationArmed) {
        await api.cancelAutomationSession().catch((error: unknown) => {
          console.warn("[MIRROR_MODE] gate cancel failed:", error);
        });
      }
    }
  };

  const submitMirrorFeedback = async (kind: MirrorFeedbackKind) => {
    const nextCorrectionCount =
      kind === "correction" ? mirrorCorrectionCount + 1 : mirrorCorrectionCount;
    setMirrorCorrectionCount(nextCorrectionCount);
    setMirrorFeedbackStatus("Updating reward from measured feedback...");

    try {
      const result = await api.behaviorRecordFeedback?.({
        kind,
        arm: mirrorFeedbackArm || "C",
        correctionCount: nextCorrectionCount,
        targetLabel: "Mirror Mode user comparison",
      });
      if (result?.state) {
        setBehavioralState(result.state);
        setSpecMood(result.state.moodLabel || "idle");
      }
      setMirrorFeedbackStatus(
        kind === "accept"
          ? "Accepted: reward + confidence updated."
          : kind === "override"
            ? "Override recorded: reward penalty + behavior delta saved."
            : kind === "correction"
              ? "Correction recorded: stronger penalty applied."
              : "Hesitation recorded: confidence softened.",
      );
    } catch (error) {
      console.error("[BEHAVIOR] feedback failed:", error);
      setMirrorFeedbackStatus(messageFromError(error));
    }
  };

  const startNewChat = () => {
    setIntent("");
    setRealAppIntent("");
    setLastNodeId("");
    setCurrentStep(null);
    setReplayState("idle");
    setReplayMode(null);
    setUltraSessionHistory([]);
    setUltraState("idle");
    setMirrorStatus("idle");
    setSpecMood(behavioralState?.moodLabel || "idle");
    setErrorMessage("");
    setManualConfirmMessage("");
    setCalibrationMessage("");
    setAgentStatusMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setSelectedTargetMapping(null);
    setHoveredRealAppTargetKey("");
    setPreviewGhostStart(null);
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setInteractivity(true);
    setLoadingMessage("Analyzing your screen...");
    if (api.stopSpeaking) {
      void api.stopSpeaking().catch(() => undefined);
    }
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>(".input-bar-field")?.focus();
    }, 0);
  };

  const isMirrorRunning = mirrorStatus === "running";
  const isReplayRunning = replayState === "running" || isMirrorRunning;
  const showWalkthroughDebug =
    SHOW_WALKTHROUGH_DEBUG && replayMode === "walkthrough" && currentStep;
  const statusText = currentStep
    ? `Step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"}: ${
        currentStep.instruction ||
        currentStep.targetLabel ||
        (replayMode === "auto" ? "Executing action" : "Follow the ghost cursor")
      }`
    : isMirrorRunning
      ? "Mirror Mode controlling cursor..."
      : replayMode === "auto"
        ? "Executing workflow..."
        : "Walkthrough running...";
  const displayedBehavior = blendedPreview || behavioralState;
  const blendFrom = firstCheckpoint(behaviorCheckpoints);
  const blendTo = latestCheckpoint(behaviorCheckpoints);
  const canBlend = Boolean(blendFrom && blendTo && blendFrom.id !== blendTo.id);
  const hasRealBehaviorCheckpoint = behaviorCheckpoints.some(
    (checkpoint) => checkpoint.synthetic !== true,
  );
  const isMirrorModeLocked =
    !hasCompletedWalkthrough && !hasRealBehaviorCheckpoint;
  const isMirrorButtonDisabled =
    isLoading || mirrorStatus === "running" || isMirrorModeLocked;
  const mirrorButtonLabel =
    mirrorStatus === "running"
      ? "Mirroring..."
      : !hasCompletedWalkthrough
        ? "Mirror Mode (needs walkthrough)"
        : "Mirror Mode ready";
  const realAppConfidenceThreshold =
    realAppTargets?.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
  const realAppMarkerTargets = realAppTargets?.targets || [];
  const targetCandidateLimit = showDebugTools
    ? DEBUG_TARGET_LIMIT
    : NORMAL_TARGET_LIMIT;
  const displayedRealAppTargets = realAppMarkerTargets.slice(
    0,
    targetCandidateLimit,
  );
  const hiddenRealAppTargetCount = Math.max(
    0,
    realAppMarkerTargets.length - displayedRealAppTargets.length,
  );
  const showRealAppVerification = Boolean(
    realAppTargets || selectedRealAppTarget || isManualTargetPicking,
  );
  const showFallbackWorkflow = Boolean(realAppTargets?.fallbackAvailable);
  const showWorkflowCard =
    (showFallbackWorkflow || showRealAppVerification) && !isManualTargetPicking;
  const selectedTargetConfidence = selectedRealAppTarget?.confidence;
  const selectedTargetIsLowConfidence =
    typeof selectedTargetConfidence === "number" &&
    selectedTargetConfidence < realAppConfidenceThreshold;
  const currentRealAppGoal =
    realAppIntent || intent || realAppTargets?.prompt || "";
  const selectedTargetLabel = selectedRealAppTarget?.label || "";
  const realAppTargetHelperText = selectedRealAppTarget
    ? `Previewing: ${selectedTargetLabel}.`
    : "Pick a target to preview.";
  const workflowCardClassName = [
    "specter-workflow-card",
    showDebugTools ? "is-debug-targets" : "is-compact-targets",
  ].join(" ");
  const markerRenderKey = displayedRealAppTargets
    .map((target) => realAppTargetKey(target))
    .join("|");
  const edgeLightState: EdgeLightState = !isVisible
    ? "hidden"
    : isReplayRunning
      ? "walkthrough"
      : summonSettled
        ? "idle"
        : "summon";
  const overlayClassName = [
    "overlay-container",
    `overlay-state-${edgeLightState}`,
    isInputFocused ? "overlay-state-focused" : "",
    isHudDragging ? "overlay-hud-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const reasoningLines = useMemo(
    () =>
      buildReasoningLines({
        visible: isVisible || isReplayRunning || isLoading,
        screenApp: screenState?.app,
        screenWindowTitle: screenState?.windowTitle,
        screenSearchHint: screenState?.searchHint,
        screenTyped: screenState?.recentTypedText,
        isLoading,
        loadingMessage,
        agentStatusMessage,
        manualConfirmMessage,
        realAppNotice,
        ultraState,
        replayRunning: replayState === "running",
        currentStepInstruction:
          currentStep?.instruction || currentStep?.targetLabel || null,
        mirrorRunning: mirrorStatus === "running",
        contextReadActive,
        memorySearchActive,
      }),
    [
      isVisible,
      isReplayRunning,
      isLoading,
      screenState?.app,
      screenState?.windowTitle,
      screenState?.searchHint,
      screenState?.recentTypedText,
      loadingMessage,
      agentStatusMessage,
      manualConfirmMessage,
      realAppNotice,
      ultraState,
      replayState,
      currentStep?.instruction,
      currentStep?.targetLabel,
      mirrorStatus,
      contextReadActive,
      memorySearchActive,
    ],
  );

  const isWalkthroughActive =
    replayState === "running" &&
    (replayMode === "walkthrough" || replayMode === "auto");

  const activeStepTotal =
    sessionStepTotal || currentStep?.total || stepInstructions.size || 0;
  const activeStepIndex = currentStep?.index ?? sessionCurrentIndex ?? 0;

  const stepHistory = useMemo(
    () =>
      buildStepHistory({
        total: activeStepTotal,
        currentIndex: activeStepIndex,
        instructions: stepInstructions,
        correctedIndices: correctedStepIndices,
        completedIndices: completedStepIndices,
        sessionComplete,
      }),
    [
      activeStepTotal,
      activeStepIndex,
      stepInstructions,
      correctedStepIndices,
      completedStepIndices,
      sessionComplete,
    ],
  );

  const stepProgress = computeStepProgress(
    activeStepTotal,
    activeStepIndex,
    completedStepIndices,
    sessionComplete,
    currentStep?.ghostLocked === true,
  );

  const showProgressRail =
    isVisible || isReplayRunning || isLoading || showWorkflowCard;

  useEffect(() => {
    if (!currentStep) return;
    const instruction =
      currentStep.instruction || currentStep.targetLabel || "";
    const index = currentStep.index ?? 0;
    if (!instruction) return;
    setStepInstructions((prev) =>
      upsertStepInstruction(prev, index, instruction),
    );
  }, [currentStep?.index, currentStep?.instruction, currentStep?.targetLabel]);

  useEffect(() => {
    const offSpec = api.onSpecEvent?.((event: { type: string; step?: any }) => {
      if (event.type === "step_corrected" && event.step?.stepId != null) {
        const idx = Number(event.step.stepId) - 1;
        setCorrectedStepIndices((prev) => new Set(prev).add(idx));
      }
      if (event.type === "step_advanced" && event.step) {
        const idx = Number(event.step.stepId ?? 1) - 1;
        const say = event.step.say || "";
        if (say) {
          setStepInstructions((prev) => upsertStepInstruction(prev, idx, say));
        }
      }
      if (event.type === "goal_complete") {
        setSpecMood("celebrating");
      }
      if (event.type === "thinking") {
        setSpecMood("thinking");
      }
    });
    return () => {
      offSpec?.();
    };
  }, []);

  useEffect(() => {
    if (!realAppTargets || isManualTargetPicking || isReplayRunning) return;
    displayedRealAppTargets.forEach((target, index) => {
      console.log("[COORD_FRAME] marker render position", {
        index,
        label: target.label,
        sourceFrame: target.sourceFrame,
        coordinateFrame: target.coordinateFrame || "viewport",
        rawTarget: target.rawTarget,
        viewport: {
          x: target.viewportX ?? target.x,
          y: target.viewportY ?? target.y,
        },
        captureBounds: target.captureMeta?.captureBounds,
        displayBounds: target.captureMeta?.displayBounds,
      });
    });
  }, [markerRenderKey, realAppTargets, isManualTargetPicking, isReplayRunning]);

  if (
    !isVisible &&
    replayState === "idle" &&
    !isLoading &&
    mirrorStatus !== "running"
  )
    return null;

  return (
    <>
      <div
        ref={overlayRef}
        data-specter-boundary="true"
        className={overlayClassName}
        style={
          {
            "--cursor-x": "50vw",
            "--cursor-y": "50vh",
            "--reveal-radius": `${IDLE_REVEAL_RADIUS}px`,
            "--reveal-strength": `${IDLE_REVEAL_STRENGTH}`,
            "--reveal-center-alpha": `${1 - IDLE_REVEAL_STRENGTH}`,
            "--reveal-mid-alpha": "0.88",
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            pointerEvents: "none",
            overflow: "hidden",
            background: "transparent",
            fontFamily: '"SF Pro Text", "Segoe UI", system-ui, sans-serif',
            transition: "background 0.5s ease",
          } as React.CSSProperties
        }
      >
        <div className="specter-split-layout">
          <div className="specter-action-stage">
            <div className="specter-overlay-wash" />
            <div
              className="siri-glow-fullscreen"
              style={{ pointerEvents: "none" }}
            />
            {(() => {
              const targetPreviewActive = Boolean(
                showWorkflowCard && selectedRealAppTarget && !isReplayRunning,
              );
              const isGhostActionReplay = Boolean(
                isReplayRunning &&
                currentStep &&
                (replayMode === "walkthrough" || replayMode === "auto"),
              );
              const isLiveGhostActive = Boolean(
                !isReplayRunning && liveGhostStep,
              );
              const guideStep = isGhostActionReplay
                ? currentStep
                : isLiveGhostActive
                  ? liveGhostStep
                  : currentStep;
              return (
                <>
                  {isGhostActionReplay ? (
                    <GhostActionPlayer
                      step={currentStep}
                      isActive={isReplayRunning}
                      start={roamingGhostPosRef.current}
                    />
                  ) : isLiveGhostActive ? (
                    <div
                      className={`ghost-live-pop${liveGhostLeaving ? " is-leaving" : ""}`}
                    >
                      <GhostActionPlayer
                        step={liveGhostStep}
                        isActive={true}
                        start={roamingGhostPosRef.current}
                      />
                    </div>
                  ) : (
                    <GhostCursor
                      mood={specMood}
                      isVisible={
                        (isVisible || isReplayRunning) && !targetPreviewActive
                      }
                      step={currentStep}
                      isSpeaking={isSpeaking}
                    />
                  )}
                  {isGhostActionReplay || isLiveGhostActive ? (
                    guideReady ? (
                      <WalkthroughGuide step={guideStep} />
                    ) : null
                  ) : (
                    <WalkthroughGuide step={currentStep} />
                  )}
                  <TargetPreviewGhost
                    target={
                      selectedRealAppTarget
                        ? {
                            x:
                              selectedRealAppTarget.viewportX ??
                              selectedRealAppTarget.x,
                            y:
                              selectedRealAppTarget.viewportY ??
                              selectedRealAppTarget.y,
                            label: selectedRealAppTarget.label,
                          }
                        : null
                    }
                    start={previewGhostStart || undefined}
                    active={targetPreviewActive}
                  />
                </>
              );
            })()}
            {(isVisible || isReplayRunning || isLoading) &&
              !(
                showWorkflowCard &&
                selectedRealAppTarget &&
                !isReplayRunning
              ) && (
                <SpecBuddy
                  mood={specMood}
                  state={displayedBehavior || undefined}
                  enabled={isVisible || isReplayRunning || isLoading}
                  roam={specBuddyRoam}
                  checkpointLabel={activeCheckpoint?.label}
                  compact={!showDebugTools && !demoPresentationMode}
                  pitchMode={pitchMode}
                  reasoningLines={demoPresentationMode ? reasoningLines : []}
                />
              )}

            {isManualTargetPicking && !isReplayRunning && (
              <div
                className="specter-manual-pick-layer"
                onMouseMove={updateManualPickPoint}
                onClick={handleManualTargetPick}
                role="button"
                aria-label="Pick a manual target"
              >
                <div
                  className="specter-manual-pick-reticle"
                  style={{
                    transform: `translate3d(${manualPickPoint.x}px, ${manualPickPoint.y}px, 0) translate(-50%, -50%)`,
                  }}
                />
                <div
                  className="specter-manual-pick-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div>
                    <strong>Pick the exact click target</strong>
                    <span>
                      Click the exact spot you want Specter to teach. Press
                      Escape to cancel.
                    </span>
                  </div>
                  <button
                    className="specter-manual-pick-cancel"
                    onClick={cancelManualTargetPicking}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showDebugTools &&
              displayedRealAppTargets.map((target, index) => {
                if (
                  !showWorkflowCard ||
                  isReplayRunning ||
                  isManualTargetPicking
                ) {
                  return null;
                }
                const key = realAppTargetKey(target);
                const isSelected = sameRealAppTarget(
                  selectedRealAppTarget,
                  target,
                );
                const isHovered = hoveredRealAppTargetKey === key;

                return (
                  <button
                    key={`${key}-${index}`}
                    className={`specter-target-marker ${
                      isSelected ? "is-selected" : ""
                    } ${isHovered ? "is-hovered" : ""}`}
                    onClick={() => selectRealAppTarget(target)}
                    onMouseEnter={() => setHoveredRealAppTargetKey(key)}
                    onMouseLeave={() => setHoveredRealAppTargetKey("")}
                    aria-label={`Select target ${target.label}`}
                    title={
                      showDebugTools
                        ? `${target.label} (${confidencePercent(target.confidence)})`
                        : target.label
                    }
                    style={{
                      left: `${Math.round(((target.viewportX ?? target.x) / 100) * window.innerWidth)}px`,
                      top: `${Math.round(((target.viewportY ?? target.y) / 100) * window.innerHeight)}px`,
                    }}
                  >
                    {index + 1}
                  </button>
                );
              })}

            {selectedRealAppTarget && !isReplayRunning && !showDebugTools && (
              <div
                className="preview-endpoint-pulse"
                style={{
                  position: "fixed",
                  left: `${Math.round(((selectedRealAppTarget.viewportX ?? selectedRealAppTarget.x) / 100) * window.innerWidth)}px`,
                  top: `${Math.round(((selectedRealAppTarget.viewportY ?? selectedRealAppTarget.y) / 100) * window.innerHeight)}px`,
                  transform: "translate(-50%, -50%)",
                  zIndex: 10001,
                  pointerEvents: "none",
                }}
              />
            )}

            {showDebugTools && selectedRealAppTarget && !isReplayRunning && (
              <div
                style={{
                  position: "fixed",
                  left: `${Math.round(((selectedRealAppTarget.viewportX ?? selectedRealAppTarget.x) / 100) * window.innerWidth)}px`,
                  top: `${Math.round(((selectedRealAppTarget.viewportY ?? selectedRealAppTarget.y) / 100) * window.innerHeight)}px`,
                  transform: "translate(-50%, -50%)",
                  zIndex: 10001,
                  width: "54px",
                  height: "54px",
                  borderRadius: "999px",
                  border: "2px solid rgba(48, 209, 88, 0.82)",
                  background: "rgba(48, 209, 88, 0.14)",
                  boxShadow: "0 0 0 8px rgba(48, 209, 88, 0.08)",
                  pointerEvents: "none",
                }}
              />
            )}

            {showDebugTools && selectedRealAppTarget && !isReplayRunning && (
              <div
                style={{
                  position: "fixed",
                  left: `${Math.min(
                    Math.round(
                      ((selectedRealAppTarget.viewportX ??
                        selectedRealAppTarget.x) /
                        100) *
                        window.innerWidth,
                    ) + 22,
                    window.innerWidth - 220,
                  )}px`,
                  top: `${Math.min(
                    Math.round(
                      ((selectedRealAppTarget.viewportY ??
                        selectedRealAppTarget.y) /
                        100) *
                        window.innerHeight,
                    ) + 22,
                    window.innerHeight - 116,
                  )}px`,
                  zIndex: 10004,
                  width: "204px",
                  padding: "9px 10px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(14, 16, 20, 0.86)",
                  color: "rgba(255,255,255,0.9)",
                  boxShadow: "0 14px 34px rgba(0,0,0,0.3)",
                  backdropFilter: "blur(14px)",
                  pointerEvents: "auto",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 850 }}>
                  {selectedRealAppTarget.label}
                </div>
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "10px",
                    lineHeight: 1.35,
                    color: "rgba(255,255,255,0.62)",
                  }}
                >
                  {`source ${selectedRealAppTarget.sourceFrame || "viewport"} / ${confidencePercent(selectedRealAppTarget.confidence)}`}
                  <br />
                  {`raw ${formatCoordinate(selectedRealAppTarget.rawTarget?.x)} / ${formatCoordinate(selectedRealAppTarget.rawTarget?.y)} -> viewport ${formatCoordinate(selectedRealAppTarget.viewportX ?? selectedRealAppTarget.x)} / ${formatCoordinate(selectedRealAppTarget.viewportY ?? selectedRealAppTarget.y)}`}
                  <br />
                  {selectedRealAppTarget.captureMeta
                    ? `capture ${selectedRealAppTarget.captureMeta.captureBounds.width}x${selectedRealAppTarget.captureMeta.captureBounds.height} / display ${selectedRealAppTarget.captureMeta.displayBounds.width}x${selectedRealAppTarget.captureMeta.displayBounds.height}`
                    : "capture metadata unavailable"}
                  <br />
                  {selectedTargetMapping?.screenPoint
                    ? `screen ${selectedTargetMapping.screenPoint.x}, ${selectedTargetMapping.screenPoint.y} / display ${selectedTargetMapping.activeDisplay?.id ?? "?"}`
                    : "screen mapping pending"}
                </div>
                <SpecterWorkflowButton
                  primary
                  style={{ marginTop: "8px", minHeight: "28px", width: "100%" }}
                  onClick={startManualTargetPicking}
                >
                  Looks wrong? Pick manually
                </SpecterWorkflowButton>
              </div>
            )}

            {showWalkthroughDebug && (
              <div
                className="walkthrough-debug-pill"
                style={{
                  position: "fixed",
                  top: "12px",
                  left: "12px",
                  background: "rgba(18, 18, 22, 0.72)",
                  color: "rgba(255, 255, 255, 0.92)",
                  padding: "5px 8px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: 0,
                  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.18)",
                  backdropFilter: "blur(10px)",
                  pointerEvents: "none",
                  zIndex: 10001,
                }}
              >
                {`STEP ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"}  X ${formatCoordinate(currentStep.x)}  Y ${formatCoordinate(currentStep.y)}`}
              </div>
            )}

            {import.meta.env.DEV && isReplayRunning && currentStep && (
              <div
                style={{
                  position: "fixed",
                  top: "12px",
                  right: "12px",
                  background: "rgba(18, 18, 22, 0.72)",
                  color: "rgba(255, 255, 255, 0.92)",
                  padding: "5px 8px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: 0,
                  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.18)",
                  backdropFilter: "blur(10px)",
                  pointerEvents: "none",
                  zIndex: 10001,
                }}
              >
                {`click-through: ${isClickThrough ? "ON" : "OFF"} | step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"} | target X ${formatCoordinate(currentStep.x)} Y ${formatCoordinate(currentStep.y)} | waiting: ${manualConfirmMessage ? "fallback" : currentStep.ghostLocked ? "click" : "approach"}`}
              </div>
            )}

            {isLoading && !demoPresentationMode && (
              <div
                style={{
                  position: "fixed",
                  bottom: "24px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(0, 0, 0, 0.75)",
                  color: "#fff",
                  padding: "10px 20px",
                  borderRadius: "20px",
                  fontSize: "14px",
                  fontWeight: 500,
                  backdropFilter: "blur(8px)",
                  pointerEvents: "none",
                  zIndex: 9999,
                }}
              >
                {loadingMessage}
              </div>
            )}

            {errorMessage && (
              <div
                style={{
                  position: "fixed",
                  top: "24px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(180, 32, 42, 0.88)",
                  color: "#fff",
                  padding: "10px 16px",
                  borderRadius: "16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  maxWidth: "min(620px, calc(100vw - 32px))",
                  textAlign: "center",
                  backdropFilter: "blur(10px)",
                  pointerEvents: "none",
                  zIndex: 10000,
                }}
              >
                {errorMessage}
              </div>
            )}

            {agentStatusMessage && !errorMessage && (
              <div
                style={{
                  position: "fixed",
                  top: "24px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(22, 126, 78, 0.9)",
                  color: "#fff",
                  padding: "10px 16px",
                  borderRadius: "16px",
                  fontSize: "13px",
                  fontWeight: 650,
                  maxWidth: "min(760px, calc(100vw - 32px))",
                  textAlign: "center",
                  overflowWrap: "anywhere",
                  backdropFilter: "blur(10px)",
                  pointerEvents: "none",
                  zIndex: 10000,
                }}
              >
                {agentStatusMessage}
              </div>
            )}

            {isReplayRunning && (
              <div
                style={{
                  position: "fixed",
                  bottom: "24px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(20, 20, 24, 0.76)",
                  color: "#fff",
                  padding: "9px 14px",
                  borderRadius: "16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  maxWidth: "min(520px, calc(100vw - 32px))",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
                  backdropFilter: "blur(10px)",
                  pointerEvents: "none",
                  zIndex: 9999,
                }}
              >
                {statusText}
              </div>
            )}

            {manualConfirmMessage && (
              <div
                style={{
                  position: "fixed",
                  bottom: "72px",
                  left: "24px",
                  transform: "none",
                  background: "rgba(10, 84, 150, 0.9)",
                  color: "#fff",
                  padding: "10px 14px",
                  borderRadius: "14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  maxWidth: "min(520px, calc(100vw - 32px))",
                  textAlign: "center",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
                  backdropFilter: "blur(10px)",
                  pointerEvents: "none",
                  zIndex: 10000,
                }}
              >
                {manualConfirmMessage}
              </div>
            )}
          </div>

          {showProgressRail && (
            <ProgressTracker
              hudRef={hudRef}
              expanded={railExpanded}
              onToggleExpand={() => setRailExpanded((v) => !v)}
              steps={stepHistory}
              total={activeStepTotal}
              currentIndex={activeStepIndex}
              stepProgress={stepProgress}
              isActive={isWalkthroughActive}
              isComplete={sessionComplete || hasCompletedWalkthrough}
              currentInstruction={statusText}
              replayMode={replayMode}
              onReplay={() => replaySavedWorkflow("walkthrough")}
              onMouseEnter={() => {
                if (import.meta.env.VITE_DEBUG_VERBOSE === "true")
                  console.log("[OVERLAY_INTERACTION] mouse entered Specter UI");
                isHudHoveredRef.current = true;
                setInteractivity(true);
              }}
              onMouseLeave={() => {
                if (import.meta.env.VITE_DEBUG_VERBOSE === "true")
                  console.log("[OVERLAY_INTERACTION] mouse left Specter UI");
                isHudHoveredRef.current = false;
                setInteractivity(false);
              }}
              agentActions={agentActions}
            >
              <section className="specter-rail-status">
                <div className="specter-rail-greeting">
                  {intent ? "Working on your goal" : "How can I help?"}
                </div>
                {intent && <div className="specter-rail-intent">{intent}</div>}
              </section>

              {showWorkflowCard && (
                <div
                  className={workflowCardClassName}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="specter-workflow-header">
                    <div>
                      <div className="specter-kicker">
                        {showFallbackWorkflow
                          ? "Vision unavailable"
                          : "Target confirmation"}
                      </div>
                      <div className="specter-workflow-title">
                        Does this look right?
                      </div>
                      <div className="specter-workflow-subtitle">
                        {showFallbackWorkflow
                          ? "I couldn't confidently detect the target. Pick manually or use Practice Mode."
                          : "Specter is previewing where it will guide you."}
                      </div>
                    </div>
                    <div className="specter-workflow-meta">
                      {showFallbackWorkflow
                        ? "Real app still works"
                        : realAppTargets?.app || "Real app"}
                    </div>
                  </div>

                  {!showFallbackWorkflow && currentRealAppGoal && (
                    <div className="specter-workflow-goal">
                      For: {currentRealAppGoal}
                    </div>
                  )}

                  {!showFallbackWorkflow && realAppNotice && (
                    <div
                      className={`specter-workflow-note ${selectedTargetIsLowConfidence ? "is-warning" : ""}`}
                    >
                      {realAppNotice}
                    </div>
                  )}

                  {!showFallbackWorkflow &&
                    displayedRealAppTargets.length > 0 && (
                      <div className="specter-target-list">
                        {displayedRealAppTargets.map((target, index) => {
                          const key = realAppTargetKey(target);
                          const isSelected = sameRealAppTarget(
                            selectedRealAppTarget,
                            target,
                          );
                          const isHovered = hoveredRealAppTargetKey === key;

                          return (
                            <button
                              key={`${key}-list-${index}`}
                              className={`specter-target-list-item ${
                                isSelected ? "is-selected" : ""
                              } ${isHovered ? "is-hovered" : ""}`}
                              onClick={() => selectRealAppTarget(target)}
                              onMouseEnter={() =>
                                setHoveredRealAppTargetKey(key)
                              }
                              onMouseLeave={() =>
                                setHoveredRealAppTargetKey("")
                              }
                            >
                              <span>{index + 1}</span>
                              <strong>{target.label}</strong>
                              {showDebugTools && (
                                <em>{confidencePercent(target.confidence)}</em>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                  {!showFallbackWorkflow && hiddenRealAppTargetCount > 0 && (
                    <div className="specter-target-hidden-note">
                      {showDebugTools
                        ? `${hiddenRealAppTargetCount} more hidden.`
                        : "More candidates available in Debug."}
                    </div>
                  )}

                  {!showFallbackWorkflow && (
                    <div
                      className={`specter-workflow-note ${selectedRealAppTarget ? "is-ready" : ""}`}
                    >
                      {realAppTargetHelperText}
                    </div>
                  )}

                  {!showFallbackWorkflow &&
                    showDebugTools &&
                    selectedRealAppTarget && (
                      <div className="specter-target-summary">
                        <div style={{ minWidth: 0 }}>
                          <div className="specter-target-title">
                            {selectedRealAppTarget.label}
                          </div>
                          <div className="specter-target-detail">
                            X {formatCoordinate(selectedRealAppTarget.x)} / Y{" "}
                            {formatCoordinate(selectedRealAppTarget.y)} /
                            Confidence{" "}
                            {confidencePercent(
                              selectedRealAppTarget.confidence,
                            )}
                          </div>
                          {selectedRealAppTarget.description && (
                            <div className="specter-target-detail">
                              {selectedRealAppTarget.description}
                            </div>
                          )}
                        </div>
                        <div
                          className={`specter-target-dot ${selectedTargetIsLowConfidence ? "is-warning" : ""}`}
                        />
                      </div>
                    )}

                  <div className="specter-action-row openui-action-row">
                    {showFallbackWorkflow ? (
                      <>
                        <SpecterWorkflowButton
                          primary
                          disabled={isLoading}
                          onClick={startManualTargetPicking}
                        >
                          Pick manually
                        </SpecterWorkflowButton>
                        <SpecterWorkflowButton
                          disabled={isLoading}
                          onClick={() => {
                            setRealAppTargets(null);
                            startRealAppTest(
                              realAppIntent ||
                                intent ||
                                DEFAULT_REAL_APP_PROMPT,
                            );
                          }}
                        >
                          Retry AI
                        </SpecterWorkflowButton>
                        <SpecterWorkflowButton
                          disabled={isLoading}
                          onClick={startNewChat}
                        >
                          New prompt
                        </SpecterWorkflowButton>
                        <SpecterWorkflowButton
                          disabled={isLoading}
                          onClick={prepareControlledDemo}
                        >
                          Practice Mode
                        </SpecterWorkflowButton>
                      </>
                    ) : (
                      <>
                        <SpecterWorkflowButton
                          primary
                          disabled={isLoading}
                          onClick={startManualTargetPicking}
                        >
                          Pick manually
                        </SpecterWorkflowButton>
                        <SpecterWorkflowButton
                          disabled={isLoading}
                          onClick={() => {
                            setRealAppTargets(null);
                            setSelectedRealAppTarget(null);
                            setSelectedTargetMapping(null);
                            setHoveredRealAppTargetKey("");
                            startRealAppTest(
                              realAppIntent ||
                                intent ||
                                DEFAULT_REAL_APP_PROMPT,
                            );
                          }}
                        >
                          Retry
                        </SpecterWorkflowButton>
                        <SpecterWorkflowButton
                          disabled={isLoading}
                          onClick={startNewChat}
                        >
                          New prompt
                        </SpecterWorkflowButton>
                        {showDebugTools && (
                          <SpecterWorkflowButton
                            disabled={isLoading}
                            onClick={prepareControlledDemo}
                          >
                            Practice Mode
                          </SpecterWorkflowButton>
                        )}
                        <SpecterWorkflowButton
                          primary
                          disabled={isLoading || !selectedRealAppTarget}
                          onClick={startRealAppWalkthrough}
                        >
                          Start ghost
                        </SpecterWorkflowButton>
                      </>
                    )}
                  </div>
                </div>
              )}

              {!showWorkflowCard && !demoPresentationMode && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    width: "100%",
                    justifyContent: "center",
                  }}
                >
                  <ModeToggle
                    mode={mode}
                    onChange={setMode}
                    memoryOpen={showMemoryPanel}
                    onToggleMemory={() => setShowMemoryPanel((open) => !open)}
                  />
                  <button
                    className="specter-debug-toggle"
                    onClick={() => setShowDebugTools(!showDebugTools)}
                    style={{
                      background: showDebugTools
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "8px",
                      padding: "4px 8px",
                      color: "rgba(255,255,255,0.6)",
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {showDebugTools ? "Hide debug" : "Debug"}
                  </button>
                </div>
              )}

              {/* Voice-only: Specter is purely conversational. The mic dock
                  at the bottom of the screen is the single input surface —
                  no chat thread, no text field. */}

              {showDebugTools && (
                <div
                  className="specter-debug-tools"
                  style={{
                    width: "100%",
                    background: "rgba(12, 14, 18, 0.45)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "14px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 800,
                      color: "rgba(255,255,255,0.3)",
                      textTransform: "uppercase",
                    }}
                  >
                    Debug / Dev Fallback Tools
                  </div>

                  <div
                    className="mirror-mode-panel"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      padding: "10px",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        disabled={isLoading}
                        onClick={seedSpecDemo}
                        style={{
                          flex: 1,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "10px",
                          padding: "8px",
                          color: "white",
                          background: "rgba(100,210,255,0.16)",
                          fontSize: "11px",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        DEV Synthetic Data
                      </button>
                      <button
                        disabled={isLoading}
                        onClick={createBehaviorCheckpoint}
                        style={{
                          flex: 1,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "10px",
                          padding: "8px",
                          color: "white",
                          background: "rgba(48,209,88,0.16)",
                          fontSize: "11px",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Create Checkpoint
                      </button>
                      <button
                        disabled={isMirrorButtonDisabled}
                        onClick={runMirrorMode}
                        style={{
                          flex: 1,
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "10px",
                          padding: "8px",
                          color: "white",
                          background: isMirrorRunning
                            ? "rgba(27,240,255,0.26)"
                            : "rgba(191,90,242,0.18)",
                          fontSize: "11px",
                          fontWeight: 800,
                          cursor: isMirrorButtonDisabled
                            ? "default"
                            : "pointer",
                        }}
                      >
                        {mirrorButtonLabel}
                      </button>
                      <button
                        onClick={() => setPitchMode((current) => !current)}
                        style={{
                          flex: 1,
                          minWidth: "120px",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "10px",
                          padding: "8px",
                          color: "white",
                          background: pitchMode
                            ? "rgba(255,214,10,0.22)"
                            : "rgba(255,255,255,0.08)",
                          fontSize: "11px",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Pitch Mode {pitchMode ? "ON" : "OFF"}
                      </button>
                    </div>

                    {isMirrorModeLocked && (
                      <div
                        style={{
                          fontSize: "9px",
                          color: "rgba(255,255,255,0.35)",
                          fontWeight: 700,
                        }}
                      >
                        Use computer 60s, create a checkpoint, then start a
                        walkthrough to unlock Mirror Mode.
                      </div>
                    )}

                    {pitchMode && (
                      <div
                        className="mirror-pitch-timeline"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                          gap: "5px",
                          color: "rgba(255,255,255,0.78)",
                          fontSize: "9px",
                          fontWeight: 850,
                        }}
                      >
                        {[
                          "Measured",
                          "Signature",
                          "Checkpoint",
                          "Mirror",
                          "Feedback",
                        ].map((label, index) => (
                          <div
                            key={label}
                            style={{
                              minHeight: "34px",
                              borderRadius: "9px",
                              padding: "6px",
                              background: "rgba(255,255,255,0.07)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              display: "grid",
                              alignContent: "center",
                              gap: "2px",
                            }}
                          >
                            <span style={{ color: "rgba(100,210,255,0.82)" }}>
                              Step {index + 1}
                            </span>
                            <span>{label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {(mirrorFeedbackStatus || mirrorStatus === "complete") && (
                      <div
                        style={{
                          display: "grid",
                          gap: "7px",
                          padding: "8px",
                          borderRadius: "10px",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.72)",
                          fontSize: "10px",
                          fontWeight: 800,
                        }}
                      >
                        <div>
                          {mirrorFeedbackStatus ||
                            "Compare Mirror Mode against your real override."}
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                            gap: "6px",
                          }}
                        >
                          {(
                            [
                              ["accept", "Accept"],
                              ["override", "Override"],
                              ["hesitation", "Hesitated"],
                              ["correction", "Corrected"],
                            ] as Array<[MirrorFeedbackKind, string]>
                          ).map(([kind, label]) => (
                            <button
                              key={kind}
                              onClick={() => void submitMirrorFeedback(kind)}
                              style={{
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "9px",
                                padding: "7px 5px",
                                color: "white",
                                background: "rgba(255,255,255,0.08)",
                                fontSize: "10px",
                                fontWeight: 850,
                                cursor: "pointer",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {canBlend && blendFrom && blendTo && (
                      <div
                        style={{
                          display: "grid",
                          gap: "6px",
                          color: "rgba(255,255,255,0.68)",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "8px",
                          }}
                        >
                          <span>{blendFrom.label}</span>
                          <span>{blendTo.label}</span>
                        </div>
                        <input
                          aria-label="Blend behavioral checkpoints"
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={blendT}
                          onChange={(event) =>
                            void updateBlendPreview(Number(event.target.value))
                          }
                        />
                        <div>
                          {(behaviorDiff?.summary || []).join(" | ") ||
                            "Move the slider to blend past-you and present-you."}
                        </div>
                      </div>
                    )}

                    {displayedBehavior && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: "4px 10px",
                          color: "rgba(255,255,255,0.58)",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        <span>
                          load{" "}
                          {behaviorPercent(displayedBehavior.cognitiveLoad)}
                        </span>
                        <span>
                          impulse{" "}
                          {behaviorPercent(displayedBehavior.impulsivity)}
                        </span>
                        <span>
                          flow {behaviorPercent(displayedBehavior.flowScore)}
                        </span>
                        <span>
                          revision{" "}
                          {behaviorPercent(displayedBehavior.revisionRate)}
                        </span>
                        <span>
                          confidence{" "}
                          {behaviorPercent(
                            displayedBehavior.decisionConfidence,
                          )}
                        </span>
                        <span>
                          {activeCheckpoint?.commitMessage ||
                            "behavior model live"}
                        </span>
                      </div>
                    )}

                    {behaviorDiff && (
                      <div
                        className="mirror-diff-card"
                        style={{
                          display: "grid",
                          gap: "5px",
                          padding: "8px",
                          borderRadius: "10px",
                          background: "rgba(0,0,0,0.16)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.72)",
                          fontSize: "10px",
                          fontWeight: 800,
                        }}
                      >
                        <div style={{ color: "rgba(255,255,255,0.9)" }}>
                          What changed?
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span>
                            Impulsivity{" "}
                            {signedBehaviorPercent(
                              behaviorDiff.deltas.impulsivity,
                            )}
                          </span>
                          <span>
                            Decision confidence{" "}
                            {signedBehaviorPercent(
                              behaviorDiff.deltas.decisionConfidence,
                            )}
                          </span>
                          <span>
                            Revision rate{" "}
                            {signedBehaviorPercent(
                              behaviorDiff.deltas.revisionRate,
                            )}
                          </span>
                        </div>
                        <div style={{ color: "rgba(100,210,255,0.78)" }}>
                          {blendTo?.commitMessage ||
                            activeCheckpoint?.commitMessage ||
                            "behavioral checkpoint ready"}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Provider status pills */}
                  {aiHealthPills && (
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        flexWrap: "wrap",
                        marginBottom: "2px",
                      }}
                    >
                      {(
                        [
                          {
                            label: "Claude vision",
                            ok: aiHealthPills?.anthropic?.testRequest?.pass,
                            detail: aiHealthPills?.anthropic?.testRequest?.pass
                              ? "ready"
                              : aiHealthPills?.anthropic?.testRequest
                                  ?.category || "failing",
                          },
                          {
                            label: "Voice in",
                            ok: aiHealthPills?.gemini?.transcribeConfigured,
                            detail: aiHealthPills?.gemini?.transcribeConfigured
                              ? "ready"
                              : "missing key",
                          },
                          {
                            label: "Voice",
                            ok:
                              aiHealthPills?.elevenlabs?.configured ||
                              aiHealthPills?.geminiTTS?.configured,
                            detail: aiHealthPills?.elevenlabs?.configured
                              ? "ElevenLabs"
                              : aiHealthPills?.geminiTTS?.configured
                                ? "Gemini TTS"
                                : lastTTSProvider === "macos"
                                  ? "macOS fallback"
                                  : "macOS fallback",
                          },
                        ] as Array<{
                          label: string;
                          ok: boolean;
                          detail: string;
                        }>
                      ).map((pill) => (
                        <div
                          key={pill.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 8px",
                            borderRadius: "999px",
                            background: pill.ok
                              ? "rgba(48,209,88,0.12)"
                              : "rgba(255,69,58,0.12)",
                            border: `1px solid ${pill.ok ? "rgba(48,209,88,0.3)" : "rgba(255,69,58,0.3)"}`,
                            fontSize: "10px",
                            fontWeight: 600,
                            color: pill.ok
                              ? "rgba(48,209,88,0.9)"
                              : "rgba(255,100,80,0.9)",
                          }}
                        >
                          <span>{pill.ok ? "OK" : "Issue"}</span>
                          <span>
                            {pill.label}: {pill.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    <button
                      disabled={isLoading}
                      onClick={prepareControlledDemo}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(255,255,255,0.1)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Dev fallback demo
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={runCoordinateCalibration}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(10,132,255,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Log calibration
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={checkAIBackend}
                      style={{
                        flex: 1,
                        minWidth: "130px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(255,204,0,0.14)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Check Voice Backend
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={async () => {
                        try {
                          const res = await api.testVoiceOutput();
                          const providerNames: Record<string, string> = {
                            elevenlabs: "ElevenLabs",
                            gemini: "Gemini TTS",
                            macos: "macOS Fallback (Robotic)",
                          };
                          let msg = `Voice test OK - used ${providerNames[res.providerUsed] || res.providerUsed}.`;
                          if (res.failures?.elevenlabs) {
                            msg += `\nElevenLabs failed: ${res.failures.elevenlabs}`;
                          }
                          if (res.failures?.gemini) {
                            msg += `\nGemini TTS failed: ${res.failures.gemini}`;
                          }
                          if (
                            res.providerUsed === "macos" &&
                            !res.failures?.elevenlabs &&
                            !res.failures?.gemini &&
                            res.fallbackReason
                          ) {
                            msg += `\nReason: ${res.fallbackReason}`;
                          }
                          setAiHealthMessage(msg);
                        } catch (err) {
                          setAiHealthMessage(
                            `Voice test failed: ${messageFromError(err)}`,
                          );
                        }
                      }}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(255,105,180,0.14)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Test Voice Output
                    </button>
                    <button
                      disabled={isLoading || !intent}
                      onClick={() => runLegacyPlannerFlow(intent)}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(191,90,242,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Legacy planner
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={moveCursorToScreenCenter}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(48,209,88,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Move center
                    </button>
                  </div>
                  {calibrationMessage && (
                    <div
                      style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: "10px",
                      }}
                    >
                      {calibrationMessage}
                    </div>
                  )}
                  {aiHealthMessage && (
                    <div
                      style={{
                        color: "rgba(255,255,255,0.58)",
                        fontSize: "10px",
                        lineHeight: 1.45,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {aiHealthMessage}
                    </div>
                  )}
                </div>
              )}

              {showMemoryPanel && <GhostWikiPanel />}

              {lastNodeId && !showWorkflowCard && (
                <SessionPanel
                  intent={intent}
                  nodeId={lastNodeId}
                  appName={screenState?.app}
                  isBusy={isLoading}
                  isWalkthroughActive={isWalkthroughActive}
                  stepProgress={stepProgress}
                  onWalkthrough={() => replaySavedWorkflow("walkthrough")}
                  onAutoExecute={() => replaySavedWorkflow("auto")}
                />
              )}
            </ProgressTracker>
          )}
        </div>

        {isVisible && !isReplayRunning && !showWorkflowCard && (
          /* Purely conversational: a single mic is the only input surface.
             State (listening / thinking / speaking) shows as a small status
             pill under the mic — no chat thread, no text box. */
          <VoiceMicButton
            disabled={isLoading}
            conversationState={ultraState}
            voiceFallback={lastTTSProvider === "macos"}
            onSpokenInput={handleUltraSpokenInput}
            onRecordingStart={cancelGhostListen}
            onTranscriptionStart={() => setUltraState("transcribing")}
            onTranscriptionEnd={() => {
              setUltraState((s) =>
                s === "transcribing" ? "waitingForUser" : s,
              );
            }}
            onMouseEnter={() => setInteractivity(true)}
            onMouseLeave={() => setInteractivity(false)}
          />
        )}
      </div>
    </>
  );
};

export default OverlayApp;
