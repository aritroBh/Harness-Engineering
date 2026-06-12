# Person 2 — Cognition & State (A3 + A4 + A5)

You own everything from "clean serialized tree" → "next instruction + remembered progress."
You can work the whole way against canned data (`MOCK_STEP` / a fake `SerializedTree`) without waiting on
Person 1's AX events. Contract types live in `src/shared/partA-contract.ts`.

## The one architectural change that drives everything

Specter's `planSteps` (`src/main/ai/planner.ts`) plans a **whole tutorial upfront**:
`{ levelTitle, estimatedMinutes, steps[] }`. The plan's A3 is **one Claude call per step**, re-grounded on the
live tree each time. So the spine of your work is a new **single-step loop**:

```
session:start ──▶ planNextStep(tree) ──▶ ContractStep ──▶ (overlay shows + speaks)
                       ▲                                          │
                       │                                   user acts
                  re-plan on                                      │
                  AX event ◀──── verifyStep(event, expected) ◀────┘
                       │
                  goal_done ──▶ summarizeSession() ──▶ update SkillProfile
```

We keep `planSteps` for the existing walkthrough/demo paths; `planNextStep` is additive.

## Milestones (in dependency order)

### M1 — Single-step planner (A3)  ⬅ start here, no dependencies
- [ ] `planNextStep(goal, tree: SerializedTree, completed: ContractStep[], profileSummary: string)` in `planner.ts`.
- [ ] New system prompt: patient tutor, **one step**, ≤2 sentences, explain *why*. Output strict `PlannerOutput`
      (`{ say, element_id, action_type, goal_complete }`).
- [ ] `resolveStep(output, tree)` → `ContractStep`: map `element_id` → `bbox` from `tree.elements`. If the id is
      gone, return a sentinel so the caller re-plans instead of pointing at nothing.
- [ ] Unit-test against a canned `SerializedTree` + the Gmail-attachment goal. No API key path: stub a fallback.

### M2 — Session loop + contract channels (A3 + A6 glue)
- [ ] `session:start` IPC handler → `SessionStartResponse` (greeting from profile, see M4).
- [ ] `step:current` handler returns the latest `ContractStep`; emit `spec:event` `{type:"thinking"}` the instant
      `planNextStep` starts so the overlay never freezes.
- [ ] Wire canned responses first (hour-2 deadline for Group B), real planner second.

### M3 — Verification loop (A4)  ⬅ needs Person 1's AX events (~hour 6); test with synthetic events first
- [ ] `verifyStep(event, expectedStep)`: did the user interact with `expectedStep.target.elementId`?
  - match → emit `spec:event` `step_advanced`, call `planNextStep` for the next one.
  - mismatch → one cheap Claude call → friendly `correction` → emit `step_corrected`.
- [ ] Debounce: only evaluate on focus-change or a 2s typing pause (reuse `behavioral/tracker.ts` signals).
- [ ] Timeout: ~20s with no relevant event → re-speak the current step (gentle nudge).

### M4 — Memory: skill profile + session summary (A5) ✅ done
- [x] `SkillProfile` persistence in `session/skillProfileStore.ts` (JSON under Application Support,
      `SPECTER_PROFILE_PATH`-overridable for tests).
- [x] On `session:start`: load the app's profile, inject `profileSummary()` into `planNextStep`, and do the
      "Welcome back!" greeting when there's prior history.
- [x] On `goal_complete`: `summarizeSession()` (one Claude call + heuristic fallback) updates `knows` /
      `struggledWith` / `proficiency`. Emits `goal_complete` with `learned` populated.
- [x] `profile:seed-demo` IPC + `seedDemoProfile()` for the single-run memory demo.
- [x] Test: `npm run test:skillProfile`.

---

## Status: M1–M4 complete ✅

All four milestones are built and tested against canned data (no API key / Accessibility needed):
`npm run test:planNextStep && npm run test:tutorSession && npm run test:verificationLoop && npm run test:skillProfile`

Remaining integration work is shared with Person 1 + Group B: feed real AX events through the verifier
(ideally with an `elementId` in the watcher payload — see M3 note), and tune the planner prompt against the
live Gmail-attachment scenario.

## Files you'll touch
- `src/main/ai/planner.ts` — add `planNextStep`, `resolveStep` (M1), correction call (M3).
- `src/main/index.ts` + `src/preload/overlay.ts` — `session:start`, `step:current`, `spec:event` (M2).
- `src/main/session/storage.ts` / a new `skillProfile.ts` — profile + summary (M4).
- `src/shared/partA-contract.ts` — the shared types (already exists; extend if needed).

## Seam with Person 1
You consume `SerializedTree`. Until their real tree lands, use a canned one. Agree on `ContractElement.id`
stability and the physical-px `bbox` convention up front — that's the only thing you both have to match.
