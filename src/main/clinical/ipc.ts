import type { BrowserWindow, IpcMain } from "electron";
import { validateSender } from "../security/ipcGuards";
import {
  APEX_TARGETS,
  buildApexTransitions,
  compileApexNotesWalkthrough,
} from "./apex";
import {
  captureFromClipboard,
  captureManualPaste,
  type CaptureMeta,
} from "./capture";
import {
  addSource,
  createBundle,
  createSourceNote,
  summarizeBundle,
} from "./contextBundle";
import { generateDraftNote, validateDraft } from "./drafter";
import {
  buildTransitions,
  compileEhrWorkflow,
  EHR_TARGETS,
} from "./ehrWorkflow";
import {
  generateNotesSummary,
  validateNotesSummary,
  type NotesSummary,
} from "./notesSummarizer";
import {
  isProhibitedAutonomousAction,
  PROHIBITED_AUTONOMOUS_ACTIONS,
} from "./prohibitedActions";
import { dryRunWorkflow, WorkflowEngine } from "./workflowEngine";
import { clinicalError, clinicalLog, clinicalWarn } from "./logger";
import type {
  ActionTrace,
  ClinicalContextBundle,
  DraftNote,
  EhrAction,
} from "./types";

interface ApexWalkthroughState {
  actions: EhrAction[];
  cursor: number;
  startedAt: string | null;
  completedSteps: Array<{
    id: string;
    completedAt: string;
    capturedSourceId?: string;
  }>;
}

interface ClinicalSessionState {
  bundle: ClinicalContextBundle;
  draft: DraftNote | null;
  lastTraceAt: string | null;
  apex: ApexWalkthroughState;
  apexSummary: NotesSummary | null;
}

function buildApexState(): ApexWalkthroughState {
  return {
    actions: compileApexNotesWalkthrough(),
    cursor: 0,
    startedAt: null,
    completedSteps: [],
  };
}

const session: ClinicalSessionState = {
  bundle: createBundle({ encounterType: "Inpatient admission" }),
  draft: null,
  lastTraceAt: null,
  apex: buildApexState(),
  apexSummary: null,
};

function broadcast(
  window: BrowserWindow | null,
  channel: string,
  payload: unknown,
): void {
  if (!window || window.isDestroyed()) return;
  if (window.webContents.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

function emitBundleUpdate(windowProvider: () => BrowserWindow | null): void {
  broadcast(windowProvider(), "clinical:bundle-updated", {
    bundleSize: session.bundle.sources.length,
    captureMethod: session.bundle.captureMethod,
    sourceIds: session.bundle.sources.map((s) => s.id),
  });
}

function snapshotApex(): {
  actions: EhrAction[];
  transitions: ReturnType<typeof buildApexTransitions>;
  cursor: number;
  total: number;
  currentAction: EhrAction | null;
  finished: boolean;
  startedAt: string | null;
  completedSteps: ApexWalkthroughState["completedSteps"];
  bundleSize: number;
  hasSummary: boolean;
} {
  const apex = session.apex;
  const total = apex.actions.length;
  const finished = apex.cursor >= total;
  return {
    actions: apex.actions,
    transitions: buildApexTransitions(apex.actions),
    cursor: apex.cursor,
    total,
    currentAction: finished ? null : apex.actions[apex.cursor],
    finished,
    startedAt: apex.startedAt,
    completedSteps: apex.completedSteps.slice(),
    bundleSize: session.bundle.sources.length,
    hasSummary: session.apexSummary !== null,
  };
}

function emitApexUpdate(windowProvider: () => BrowserWindow | null): void {
  const snap = snapshotApex();
  broadcast(windowProvider(), "clinical:apex-updated", {
    cursor: snap.cursor,
    total: snap.total,
    finished: snap.finished,
    completed: snap.completedSteps.length,
    bundleSize: snap.bundleSize,
    hasSummary: snap.hasSummary,
  });
}

export function getCurrentClinicalSession(): ClinicalSessionState {
  return session;
}

export function registerClinicalIpc(
  ipcMain: IpcMain,
  windowProvider: () => BrowserWindow | null,
): void {
  ipcMain.handle("clinical:bundle:get", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    return {
      patientContext: session.bundle.patientContext,
      sources: session.bundle.sources.map((s) => ({
        id: s.id,
        noteType: s.noteType,
        author: s.author,
        service: s.service,
        timestamp: s.timestamp,
        sourceScreen: s.sourceScreen,
        contentHash: s.contentHash,
        chars: s.rawText.length,
        rawTextPreview:
          s.rawText.length > 240 ? s.rawText.slice(0, 240) + "…" : s.rawText,
        hasSections: Boolean(
          s.extractedSections && Object.keys(s.extractedSections).length > 0,
        ),
      })),
      captureMethod: session.bundle.captureMethod,
      createdAt: session.bundle.createdAt,
      summary: summarizeBundle(session.bundle),
    };
  });

  ipcMain.handle("clinical:bundle:reset", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    session.bundle = createBundle({ encounterType: "Inpatient admission" });
    session.draft = null;
    session.apex = buildApexState();
    session.apexSummary = null;
    clinicalLog("bundle reset");
    emitBundleUpdate(windowProvider);
    emitApexUpdate(windowProvider);
    return { ok: true };
  });

  ipcMain.handle(
    "clinical:bundle:add-clipboard",
    async (event, meta: CaptureMeta = {}) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const result = captureFromClipboard(session.bundle, meta);
      emitBundleUpdate(windowProvider);
      return result;
    },
  );

  ipcMain.handle(
    "clinical:bundle:add-manual",
    async (event, rawText: string, meta: CaptureMeta = {}) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const result = captureManualPaste(session.bundle, rawText, meta);
      emitBundleUpdate(windowProvider);
      return result;
    },
  );

  ipcMain.handle(
    "clinical:bundle:add-fixture",
    async (event, payload: { rawText: string; meta?: CaptureMeta }) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const meta = payload.meta ?? {};
      const source = createSourceNote({
        rawText: payload.rawText,
        noteType: meta.noteType,
        author: meta.author,
        service: meta.service,
        timestamp: meta.timestamp,
        sourceScreen: meta.sourceScreen ?? "fixture",
        idHint: meta.idHint,
      });
      const { deduped } = addSource(session.bundle, source);
      session.bundle.captureMethod = "manual_paste";
      emitBundleUpdate(windowProvider);
      return {
        added: !deduped,
        deduped,
        bundleSize: session.bundle.sources.length,
        sourceId: source.id,
      };
    },
  );

  ipcMain.handle("clinical:workflow:compile", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const actions: EhrAction[] = compileEhrWorkflow();
    return {
      actions,
      transitions: buildTransitions(actions),
      targets: EHR_TARGETS,
      prohibited: [...PROHIBITED_AUTONOMOUS_ACTIONS],
    };
  });

  ipcMain.handle("clinical:workflow:dryrun", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const result = dryRunWorkflow();
    session.lastTraceAt = new Date().toISOString();
    broadcast(windowProvider(), "clinical:workflow-trace", {
      traceLength: result.trace.length,
      paused: result.paused.length,
      blocked: result.blocked.length,
    });
    return result;
  });

  ipcMain.handle(
    "clinical:workflow:run",
    async (event, mode: "dry_run" | "clinician_confirmed" = "dry_run") => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const engine = new WorkflowEngine();
      return engine.run({ mode, abortOnBlocked: false });
    },
  );

  ipcMain.handle(
    "clinical:draft:generate",
    async (event, draftNoteType?: string) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      try {
        const draft = await generateDraftNote(session.bundle, {
          draftNoteType: draftNoteType || "Inpatient Progress Note",
          anthropicClient: null,
        });
        session.draft = draft;
        const validation = validateDraft(draft, session.bundle);
        broadcast(windowProvider(), "clinical:draft-generated", {
          generator: draft.generator,
          ok: validation.ok,
          errors: validation.errors,
          sourceMapEntries: draft.source_map.length,
          missing: draft.uncertain_or_missing_info.length,
        });
        return { draft, validation };
      } catch (e) {
        clinicalError("draft generation failed", { err: String(e) });
        throw e;
      }
    },
  );

  ipcMain.handle("clinical:draft:get", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    if (!session.draft) return { draft: null };
    return {
      draft: session.draft,
      validation: validateDraft(session.draft, session.bundle),
    };
  });

  ipcMain.handle("clinical:safety:list-prohibited", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    return [...PROHIBITED_AUTONOMOUS_ACTIONS];
  });

  ipcMain.handle("clinical:apex:get", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    return {
      ...snapshotApex(),
      targets: APEX_TARGETS,
      summary: session.apexSummary,
    };
  });

  ipcMain.handle("clinical:apex:start", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    session.apex = buildApexState();
    session.apex.startedAt = new Date().toISOString();
    session.apexSummary = null;
    clinicalLog("apex walkthrough started");
    emitApexUpdate(windowProvider);
    return snapshotApex();
  });

  ipcMain.handle("clinical:apex:reset", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    session.apex = buildApexState();
    session.apexSummary = null;
    emitApexUpdate(windowProvider);
    return snapshotApex();
  });

  ipcMain.handle(
    "clinical:apex:advance",
    async (event, opts: { capturedSourceId?: string } = {}) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const apex = session.apex;
      if (apex.cursor >= apex.actions.length) {
        return snapshotApex();
      }
      const a = apex.actions[apex.cursor];
      if (isProhibitedAutonomousAction(a)) {
        // Defense-in-depth: the APeX walkthrough does not contain prohibited
        // actions by construction. If one ever lands, refuse rather than
        // silently advance.
        clinicalWarn("apex advance refused — prohibited action in scenario", {
          id: a.id,
        });
        throw new Error(
          `[CLINICAL_SAFETY] APeX walkthrough must not contain prohibited action ${a.id}`,
        );
      }
      apex.completedSteps.push({
        id: a.id,
        completedAt: new Date().toISOString(),
        capturedSourceId: opts.capturedSourceId,
      });
      apex.cursor++;
      clinicalLog("apex advance", { id: a.id, cursor: apex.cursor });
      emitApexUpdate(windowProvider);
      return snapshotApex();
    },
  );

  ipcMain.handle("clinical:apex:repeat-iteration", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const apex = session.apex;
    // The repeating block of the APeX scenario is open_note_preview ..
    // capture_into_bundle. After confirming a capture, the clinician can
    // either advance to apex.advance_or_finish (default) OR jump back to
    // apex.open_note_preview to grab another row. We implement that as
    // rewinding the cursor to the open_note_preview step.
    const previewIndex = apex.actions.findIndex(
      (a) => a.id === "apex.open_note_preview",
    );
    if (previewIndex < 0) {
      throw new Error("apex.open_note_preview not present in scenario");
    }
    apex.cursor = previewIndex;
    clinicalLog("apex repeat iteration", { cursor: apex.cursor });
    emitApexUpdate(windowProvider);
    return snapshotApex();
  });

  ipcMain.handle(
    "clinical:apex:capture-clipboard",
    async (event, meta: CaptureMeta = {}) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const enriched: CaptureMeta = {
        sourceScreen: "APeX Chart Review > Notes",
        ...meta,
      };
      const result = captureFromClipboard(session.bundle, enriched);
      emitBundleUpdate(windowProvider);
      emitApexUpdate(windowProvider);
      return result;
    },
  );

  ipcMain.handle(
    "clinical:apex:capture-manual",
    async (event, rawText: string, meta: CaptureMeta = {}) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      const enriched: CaptureMeta = {
        sourceScreen: "APeX Chart Review > Notes",
        ...meta,
      };
      const result = captureManualPaste(session.bundle, rawText, enriched);
      emitBundleUpdate(windowProvider);
      emitApexUpdate(windowProvider);
      return result;
    },
  );

  ipcMain.handle("clinical:apex:dryrun", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const engine = new WorkflowEngine(compileApexNotesWalkthrough());
    const result = engine.run({ mode: "dry_run", abortOnBlocked: false });
    const trace: ActionTrace[] = result.trace;
    return {
      trace,
      transitions: result.transitions,
      paused: result.paused,
      blocked: result.blocked,
      finalState: result.finalState,
      errors: result.errors,
    };
  });

  ipcMain.handle(
    "clinical:apex:summary:generate",
    async (event, scope?: string) => {
      if (!validateSender(event, windowProvider()))
        throw new Error("Unauthorized sender");
      try {
        const summary = await generateNotesSummary(session.bundle, {
          scope: scope || "APeX Chart Review > Notes",
          anthropicClient: null,
        });
        const validation = validateNotesSummary(summary, session.bundle);
        session.apexSummary = summary;
        broadcast(windowProvider(), "clinical:apex-summary-generated", {
          generator: summary.generator,
          ok: validation.ok,
          errors: validation.errors,
          perNoteCount: summary.per_note.length,
          uncovered: summary.uncovered.length,
        });
        emitApexUpdate(windowProvider);
        return { summary, validation };
      } catch (e) {
        clinicalError("apex summary generation failed", { err: String(e) });
        throw e;
      }
    },
  );

  ipcMain.handle("clinical:apex:summary:get", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    if (!session.apexSummary) return { summary: null };
    return {
      summary: session.apexSummary,
      validation: validateNotesSummary(session.apexSummary, session.bundle),
    };
  });

  ipcMain.handle("clinical:window:close", async (event) => {
    if (!validateSender(event, windowProvider()))
      throw new Error("Unauthorized sender");
    const w = windowProvider();
    if (w && !w.isDestroyed()) w.close();
    return { ok: true };
  });

  clinicalLog("registered clinical IPC handlers");
}
