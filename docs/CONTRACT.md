# Brain ↔ Overlay Contract (Hour-0 lock)

We build on Specter, so the transport is **Electron IPC** (via `src/preload/overlay.ts`), not HTTP.
The payload shapes are the TypeScript types in `src/shared/partA-contract.ts` — that file is the source of
truth; this doc maps the plan's REST schema onto Specter's real channels and lists what we add.

## Coordinate convention (lock this, test on the demo machine)
The brain **always** returns physical screen pixels + `screenScale`. The overlay divides by `screenScale`
to get CSS px. Specter currently mixes pixels and viewport-% — Person 1 (A2) makes the *contract* path pixels;
the existing cursor/overlay viewport-% path stays for `cursor:move`/`cursor:click`.

## Channels

| Plan (REST) | Specter IPC channel | Payload type | State |
|---|---|---|---|
| `POST /session/start` | `session:start` (new) | `SessionStartRequest` → `SessionStartResponse` | add |
| `GET /step/current` | `step:current` (new) or push via `spec:event` | `ContractStep` | add |
| `GET /profile` | `profile:get` (new) | `ProfilePayload` | add |
| `GET /permissions` | `permissions:get` | `PermissionStatus` | exists (`permissions.ts`) — confirm shape |
| WS `/events` | `spec:event` (new push) + existing `spec:state`/`spec:mood` | `BrainEvent` | add `spec:event` |
| `GET /debug/tree` | `debug:tree` (new, dev only) | `SerializedTree` | add |

Existing Specter channels we keep using: `planner:plan`, `realApp:detectTargets`, `cursor:move`, `cursor:click`,
`screen:capture`, `screen:analyze`, `session:save`/`load`, `context:get`, `proactive:predict`.

## Push events (brain → overlay) — `spec:event`
`BrainEvent` union: `thinking` | `step_advanced` | `step_corrected` | `goal_complete`. The overlay subscribes
once (`onSpecEvent`) like it already does for `onSpecState`. `thinking` fires the moment the planner starts so
the overlay shows the pulse — never a frozen overlay.

## Two seams
1. **Perception → Cognition** (inside the brain): `SerializedTree`. Person 1 produces it from the AX tree;
   Person 2's planner consumes `compactText` + resolves `element_id` → `bbox` from `elements`.
2. **Brain → Overlay**: `ContractStep` + `BrainEvent`. Person 2 produces; Group B renders + speaks.

## Mock-first
Group B builds against `MOCK_STEP` (exported from the contract file) and a hardcoded `BrainEvent` stream from
hour 1. Person 2 wires `session:start` / `step:current` to return canned values first, real planner second.
This is non-negotiable — ship the canned channels by hour 2.

## Group B integration cheat-sheet (Part A is live)
The renderer reaches the brain through `(window as any).api` (see `src/renderer/src/api.ts`) — same pattern as
the existing `api.onSpecState`. All of this works **today** with no API key and no Accessibility (falls back to
`MOCK_TREE`):

```ts
// 1. (demo only) seed a prior session so the greeting says "Welcome back!"
await api.seedDemoProfile("Gmail")

// 2. start a goal → greeting, and the brain begins planning step 1
const { sessionId, greeting } = await api.startTutorSession(
  "send an email with an attachment", "Gmail")
speak(greeting)

// 3. subscribe ONCE to brain → overlay push events
api.onSpecEvent((e) => {
  switch (e.type) {
    case "thinking":       showPulse(); break
    case "step_advanced":  render(e.step); speak(e.step.say); break   // e.step = ContractStep
    case "step_corrected": flashRed(); render(e.step); speak(e.step.correction); break
    case "goal_complete":  confetti(e.summary); break                  // e.summary.learned: string[]
  }
})

// 4. (optional) poll the current step on reconnect
const { ok, step } = await api.getCurrentStep()
```

Rendering a `ContractStep.target`: `bbox` is `[x1,y1,x2,y2]` in **physical px**; divide by `target.screenScale`
for CSS px. `target` is `null` for read/wait steps (no pointer). Verification is automatic — when the user
clicks, the brain advances or corrects and pushes the next `spec:event`; Group B does not call advance/verify.
