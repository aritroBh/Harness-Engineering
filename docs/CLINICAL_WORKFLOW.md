# Clinical Workflow Mode

Specter ships a clinical workflow mode that observes, structures, and assists
the documentation + ordering flow shown in the EHR demo recording. This doc
captures what the system does, what it never does, and how to run it.

## What it does

- Observes the clinician opening a patient encounter, going to Chart Review,
  filtering Notes by Type, and reading prior documentation.
- Captures multi-note context into a `ClinicalContextBundle` via clipboard,
  manual paste, or vision-extracted screen text.
- Compiles a 26-step semantic workflow across 6 phases: patient context,
  chart review, capture, multi-note review, draft, order entry.
- Drives a workflow state machine over 19 named states (`PATIENT_CONTEXT_OPEN`
  → `ORDER_SIGNED_BY_CLINICIAN`) with explicit transitions.
- Generates a source-grounded draft note. Every section either quotes verbatim
  from a captured source (with a `source_map` entry) or returns
  `[Not found in provided notes]`. Anthropic is used when an API key is set;
  otherwise a deterministic source-grounded fallback runs offline.
- Emits a structured `ActionTrace[]` with `preconditions`, `postconditions`,
  `safetyLevel`, and `outcome` for every step.

## What it never does

The runtime safety gate refuses to autonomously execute any of:

- `SIGN_NOTE`
- `SIGN_ORDER`
- `FINAL_SUBMIT_MEDICATION_ORDER`
- `BYPASS_CLINICAL_ADVISORY_WITHOUT_USER_CONFIRMATION`

Two layers enforce this:

1. **Dev-time AST guard** — `src/main/session/replaySafety.ts` already
   ensures `replayWalkthrough` cannot import or call real-mouse automation.
2. **Runtime semantic gate** — `src/main/clinical/prohibitedActions.ts`
   matches by action name + safety level. `replayAuto.ts` consults this gate
   before every step and aborts with a `replay:clinical-blocked` overlay event.

Workflow steps marked `prohibited` (e.g. `p5.manual_sign_note`,
`p6.manual_sign_orders`) are blocked. Steps marked `clinician_confirmed`
(advisory acknowledge, alternative selection, accept order) pause for explicit
clinician confirmation.

## Running the dry-run

The demo runs end-to-end with no API key, no real mouse, no real EHR:

```bash
npm run clinical:demo
```

Output: bundle summary, full state-transition log, action trace with executed /
paused / blocked outcomes, draft note with source_map, validator pass.

## Running the test suite

```bash
npm run test:clinical
```

Covers: hashing, dedup, section extraction, all 26 actions and 19 states,
prohibited-action gate (autonomous throws, clinician_confirmed allowed),
WorkflowEngine event emissions, drafter output for empty + full bundles,
source_map id validation, validator catches unmapped ids, validator catches
missing verification warning, PHI redaction defaults, action-trace pre/post
conditions.

## Running the UI

The clinical panel is a separate Electron window. Launch the app and open it
with **Cmd+Shift+K** (or Ctrl+Shift+K on Linux/Windows):

```bash
npm run dev
```

The panel has four tabs:

- **Workflow Timeline** — every action, grouped by phase, with safety-level
  pill and (after dry-run) outcome pill.
- **Captured Sources** — bundle summary, dedup hashes, section-extraction
  status, raw-text preview.
- **Draft Note** — generated draft with section bodies, validation result,
  source_map showing which source each claim came from, uncertain/missing
  list.
- **Safety Gates** — prohibited list, prohibited workflow steps, clinician
  confirmation gates, last dry-run outcome counts.

Toolbar actions: load 5 fixtures, capture clipboard, run dry-run, generate
draft, reset.

## Capture sources

| Source       | Module                                                                    |
| ------------ | ------------------------------------------------------------------------- |
| Clipboard    | `clinical/capture.ts → captureFromClipboard`                              |
| Manual paste | `clinical/capture.ts → captureManualPaste`                                |
| Vision/OCR   | `clinical/capture.ts → captureFromVision` (uses existing vision provider) |

All captures dedupe by sha256(content) before being added to the bundle.

## PHI hygiene

`src/main/clinical/logger.ts` is the clinical-only logger. By default it
redacts the keys `rawText`, `extractedSections`, `draft_note`, `summary`,
`patientId`, `encounterId`, `noteText`, `noteContent`, plus any string longer
than 80 chars. Set `LOG_PHI=true` only in HIPAA-safe environments.

## Fixtures

`test/fixtures/clinical/` holds 5 synthetic notes used by the demo and tests.
Every fixture begins with `SYNTHETIC TRAINING NOTE — NOT REAL PATIENT DATA`
and contains no real patient information.

## Module map

```
src/main/clinical/
  types.ts              — workflow states, semantic actions, draft schema
  prohibitedActions.ts  — runtime safety gate
  contextBundle.ts      — sources, dedup, section extraction
  ehrWorkflow.ts        — 26-action workflow + transitions + targets
  drafter.ts            — Anthropic + source-grounded fallback + validator
  workflowEngine.ts     — stateful engine emitting events + ActionTrace
  capture.ts            — clipboard / manual / vision capture adapters
  logger.ts             — PHI-redacting logger
  ipc.ts                — Electron IPC for clinical window
  index.ts              — node-safe re-exports

src/preload/clinical.ts            — preload bridge
src/renderer/clinical.html         — entry HTML
src/renderer/clinical/
  main.tsx              — React mount
  ClinicalApp.tsx       — top-level UI
  WorkflowTimeline.tsx  — phase-grouped action timeline
  CapturedSources.tsx   — bundle source list
  DraftNotePreview.tsx  — draft + source_map
  SafetyGates.tsx       — prohibited / confirmation gates

scripts/clinical-demo.ts   — end-to-end dry-run
scripts/test-clinical.ts   — assertion suite

test/fixtures/clinical/    — 5 synthetic notes
```

## Wiring

The Electron main process registers clinical IPC at startup
(`src/main/index.ts`) and binds `Cmd+Shift+K` to lazy-create and show the
clinical window. The window has its own preload (`preload/clinical.ts`) and
its own React entry (`renderer/clinical/main.tsx`).

The replay engine's autonomous path
(`src/main/session/replayAuto.ts`) consults
`isProhibitedAutonomousLabel` before each step. Any step whose label, id,
title, or instruction matches a prohibited verb is refused, and an overlay
event `replay:clinical-blocked` is emitted.

## Acceptance checklist

| Item                                         | Status |
| -------------------------------------------- | ------ |
| Workflow model present                       | ✓      |
| Each click action represented semantically   | ✓      |
| Not coordinate-only                          | ✓      |
| Multi-note context bundle                    | ✓      |
| Source-grounded draft note                   | ✓      |
| Raw source text preserved                    | ✓      |
| Dedup of repeated note text                  | ✓      |
| `[Not found in provided notes]` discipline   | ✓      |
| Source map for generated claims              | ✓      |
| Order-entry phase recognized                 | ✓      |
| Pause before note signing                    | ✓      |
| Pause before medication order signing        | ✓      |
| Dry-run replay mode                          | ✓      |
| Tests for safety-critical paths              | ✓      |
| UI shows state, sources, draft, safety gates | ✓      |
| Existing patterns preserved                  | ✓      |
| No happy-path-only demo logic                | ✓      |
| No PHI logged by default                     | ✓      |
