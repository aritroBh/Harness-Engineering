# Part A (Brain) — 2-Person Plan

We are **building on Specter**, not starting fresh. The hackathon plan (`tutor-agent-hackathon-plan.md`)
describes a Python/FastAPI brain; Specter already implements most of "Part A" in **TypeScript/Electron**.
So we keep Specter's stack and only build the gaps. The brain↔overlay "contract" is **Electron IPC**, not HTTP
(see `docs/CONTRACT.md`).

## What already exists in Specter (reuse as-is)

| Plan item | Specter file(s) | Status |
|---|---|---|
| A1 AX reader + permission trigger | `src/main/axDump.ts`, `src/main/permissions.ts` | ✅ works |
| A1 live event subscriptions | `src/main/context/contextTracker.ts` (3s poll only) | ⚠️ poll, not event-driven |
| A2 tree serializer | `src/main/ai/screener.ts` (`compactAxElements`, `summarizeForModel`) | ⚠️ no stable IDs |
| A3 step planner | `src/main/ai/planner.ts` (`planSteps`, `converse`, `ultraConverse`) | ✅ mostly; no `goal_complete`/`correction` |
| A4 verification | `src/main/session/replay.ts`, `src/main/behavioral/tracker.ts` | ⚠️ behavioral signals only, no AX diff |
| A5 memory | `src/main/session/{storage,recorder,types}.ts`, `src/main/ai/bandit.ts` | ⚠️ no session summary / skill taxonomy |
| A6 contract glue | `src/preload/overlay.ts`, `src/main/index.ts` IPC; `memory_service/` HTTP sidecar | ✅ IPC exists |

## The split — two halves with one clean seam

The clean seam is the **serialized tree snapshot**: Person 1 produces it, Person 2 consumes it.
They only need to agree on that one data structure (`src/shared/partA-contract.ts`) and then work independently.

### 👁️ Person 1 — Perception (A1 + A2)  🔴 critical path
Owns everything from the OS up to "here is a clean, ID-stamped tree of the foreground window."

- [ ] **A1 — Event-driven reader.** Replace the 3s poll in `contextTracker.ts` with real AX notifications
      (`kAXFocusedUIElementChanged`, `kAXValueChanged`, `kAXWindowCreated`, `kAXTitleChanged`). This is new Swift
      work in `resources/native/ax-dump.swift` → emit a change event the main process subscribes to.
- [ ] **A1 — Live in-memory snapshot.** Maintain the current tree in memory (not re-dumped per call); expose
      `GET /debug/tree` equivalent via an IPC `debug:tree` channel.
- [ ] **A1 — Permissions polish.** `permissions.ts` already wraps `node-mac-permissions`; confirm `AXIsProcessTrusted`
      status is surfaced on the `permissions:get` channel for B's onboarding (see CONTRACT).
- [ ] **A2 — Stable element IDs.** In `screener.ts`, stop using the raw numeric `i`. Assign a stable short id
      (hash of `role+title+depth-path`, e.g. `e17`) that survives across dumps. Populate `Element.id` in the contract type.
- [ ] **A2 — Coordinate contract.** Emit **physical screen px + `screen_scale`** in the serialized tree (the plan's
      convention), and keep the existing viewport-% path for the cursor/overlay. Document which is which.
- [ ] **A2 — Compact text format.** Produce the `APP/WINDOW/FOCUSED/[eNN] role "label" (x,y)` text block the planner
      eats (target ≤300 elements, truncate-with-count). This is the planner's input.
- [ ] **Hour-6 checkpoint:** click around the demo app, watch AX events stream + the live tree update in the debug log.
- [ ] **Hour-8 reality check:** serialize the *actual* demo app; if the tree is garbage, switch app or enable
      `chrome://accessibility`.

### 🧠 Person 2 — Cognition & State (A3 + A4 + A5, owns CONTRACT)
Owns everything from "clean tree" to "next instruction + remembered progress." Starts against the canned
serialized tree in `src/shared/partA-contract.ts` so they aren't blocked on Person 1.

- [ ] **A3 — Step output contract.** Extend the planner's step JSON to the contract: add `say`, `element_id`,
      `status` (active|completed|corrected|goal_done), `goal_complete`, `correction`. Map `element_id` → bbox from
      the live tree; if the element vanished, re-plan instead of pointing at nothing.
- [ ] **A3 — Tutor "say" rules.** One step at a time, ≤2 sentences, explain *why* not just *what*. Iterate the prompt
      against the scripted Gmail-attachment scenario relentlessly.
- [ ] **A3 — `thinking` event.** Emit immediately on plan start so the overlay shows the pulse state.
- [ ] **A4 — AX-diff verification (new).** On Person 1's AX event, diff observed vs expected target → advance
      (`step_advanced`) or one cheap LLM call for a friendly `step_corrected`. Debounce (focus-change or 2s typing
      pause). Timeout nudge after ~20s.
- [ ] **A5 — Skill profile + session summary (new).** Add `proficiency / knows / struggled_with` (can be derived
      from the bandit + behavioral frames). On `goal_complete`, one LLM call summarizes the session and updates the
      profile. Inject a 2–3 sentence profile summary into the planner prompt on `session:start`.
- [ ] **A5 — Seed a fake previous session** so the "Welcome back!" memory demo works on one live run.
- [ ] **A6 — Own `docs/CONTRACT.md`** and the shared types; keep B unblocked.

### Shared / Hour-0 (both, done first — see below)
- [x] `src/shared/partA-contract.ts` — the locked data types (this commit).
- [x] `docs/CONTRACT.md` — brain↔overlay channels + payloads.
- [ ] Both skim each other's section so the seam (serialized tree ↔ step schema) is agreed before coding.

## Rough timeline (map onto your real hours)
- **0–2:** Contract locked (done). Person 2 stands up canned step responses on the IPC channels so B can build.
- **0–6:** Person 1 critical path — AX events + live snapshot. Person 2 — extend planner step schema + thinking event.
- **4–8:** Person 1 — stable IDs + coord contract + compact format. Person 2 — wire planner to real tree.
- **6–14:** Person 2 — verification loop (depends on Person 1's events landing ~hour 6).
- **12–18:** Person 2 — memory summary + skill profile + seeded session.
- **14–18:** Both — harden the Gmail-attachment scenario end to end with Group B.

## Cut list (Part A slice, in order if behind)
1. Drop event-driven AX → keep the 3s poll (Person 1 falls back to existing `contextTracker`).
2. Drop AX-diff verification → advance via B's "Next" button.
3. Drop live memory write → seeded skill profile only (demo still works).
4. Drop stable IDs → keep numeric `i` (works within a single session).
