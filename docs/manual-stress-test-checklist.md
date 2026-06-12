# Specter Manual Stress-Test Checklist

Use this before a live demo. Run the app in the same mode you plan to demo, then keep the terminal visible enough to confirm logs without letting it distract from the product.

## A. Overlay Toggling

1. Double-shift open and close Specter 20 times rapidly.
2. Confirm there are no crashes, duplicate overlays, stale hidden states, or main-process EIO/logging failures.
3. Watch for `[STRESS_TEST] overlay shown` and `[STRESS_TEST] overlay hidden` logs.

## B. Multi-Display Routing

1. Move the cursor to monitor 1 and double-shift.
2. Confirm Specter appears on monitor 1 and the edge glow fits that screen.
3. Move the cursor to monitor 2 and double-shift again.
4. Confirm the next summon appears on monitor 2.
5. If the practice workspace is open, confirm it recenters on the same monitor.
6. Watch for `[WINDOW_ROUTING] cursor point`, `[WINDOW_ROUTING] selected display id / bounds`, `[WINDOW_ROUTING] moved overlay to display`, and `[WINDOW_ROUTING] moved practice window to display`.

## C. App Switching

1. Open Chrome and place the cursor over Chrome.
2. Double-shift and confirm Specter appears over Chrome.
3. Hide Specter, switch to Finder, and place the cursor over Finder.
4. Double-shift and confirm Specter appears over Finder.
5. Repeat once with another app such as Blender or a fullscreen-capable app.

## D. Click-Through

1. Open Specter and click outside the HUD.
2. Confirm the underlying app receives the click.
3. Move into the Specter HUD and click the input.
4. Confirm Specter receives the click and typing works.
5. Confirm the ghost cursor, numbered target markers, and edge glow never block outside clicks.

## E. AI Unavailable

1. Run with no AI backend or with Anthropic unavailable.
2. Submit a real-app prompt.
3. Confirm the fallback card appears cleanly.
4. Confirm no stack trace leaks to the user.
5. Confirm `Controlled Demo`, `Pick manually`, and `Retry AI` remain usable.

## F. Replay

1. Prepare the controlled demo.
2. Start the walkthrough.
3. Confirm the ghost loops toward each target.
4. Move the real cursor toward the target and confirm approach detection parks the ghost.
5. Click the target and confirm click detection advances.
6. If click detection times out, press Space or Enter and confirm fallback advances.
7. Confirm click-through is restored after replay ends or is stopped.

## G. Auto Mode

1. Prepare a saved workflow.
2. Click `Do it for me`.
3. Confirm the real-mouse warning appears before any OS mouse movement.
4. Cancel and confirm no mouse movement occurs.
5. Repeat, accept, and confirm `[AUTO_REAL_MOUSE]` logs appear for real actions.

## H. Window Lifecycle

1. Open and close the controlled demo workspace 5 times.
2. Switch apps and Spaces between opens.
3. Confirm there are no orphan windows, stale focus bugs, or off-screen overlays.
4. Disconnect or rearrange a monitor while Specter is visible if available.
5. Confirm the overlay reroutes or can be reliably summoned again with double-shift.
