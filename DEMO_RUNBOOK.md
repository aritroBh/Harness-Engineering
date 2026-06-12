# Specter — Demo Runbook

Everything below was verified working on 2026-06-11. Follow it exactly and nothing needs re-testing.

## Launch (2 minutes before demo)

```bash
cd "/Users/aritro/Downloads/Cursor x a16z/Hackathon-Building-your-own-Agent-LLM-Wiki"
# kill any leftovers, then start fresh
pkill -f "electron-vite dev"; pkill -f "MacOS/Electron ."; kill $(lsof -ti :8765) 2>/dev/null
npm run dev
```

Wait for the terminal to show `All required permissions granted`. The memory
service starts automatically on port 8765.

**Launch from Terminal.app** (not an IDE) — macOS screen/input permissions
follow whichever app launches Specter, and Terminal already has all grants.

## Hotkeys

| Keys | Action |
|---|---|
| Double-tap **Shift** | Summon / dismiss the ghost (caret lands in input automatically) |
| **Cmd+Shift+M** | Memory Dashboard (saved memories + skill progress) |
| **Cmd+Shift+K** | Specter Clinical (Epic/APeX demo window) |

## 3-minute demo script

1. **Summon** — double-tap Shift. Ghost appears, input focused.
2. **Memory moment** — type: `what do you remember about the Luma event workflow?`
   Ghost replies from real wiki memory (title, date, hosts, location) and offers
   to walk you through it. This is the "computer that remembers you" beat.
3. **Conversation** — follow up: `who are you?` — chat thread shows bubbles
   back and forth. Toggle **Chat / Voice** to show both modes.
4. **Teaching** — type: `walk me through creating an event` — target detection
   + ghost cursor guidance (guided mode).
5. **The brain** — Cmd+Shift+M: show saved memories, corrections, skill
   progress per app.
6. **Self-improvement loop** — click **Memory** button on the overlay →
   GhostWiki panel → **Run Winning Demo**: ingest → query → lint → correction →
   re-query → memory diff, all live against the local memory service.

## If something breaks

| Symptom | Fix |
|---|---|
| Overlay won't summon | Relaunch from Terminal (permissions follow the launcher) |
| "Missing permissions" red banner | Ignore if it disappears in ~15s (clears itself once input frames flow); otherwise System Settings → Privacy & Security → Screen Recording + Input Monitoring → toggle **Electron** AND **Terminal** on, relaunch |
| Memory replies generic / "Status: Offline" in panel | `kill $(lsof -ti :8765)` then relaunch app (sidecar auto-restarts) |
| Chat replies "I can help once API key is configured" | `.env` missing `ANTHROPIC_API_KEY` — it's gitignored; copy from `~/.zshrc` line 7 |
| Port 8765 already in use in logs | Same as memory fix above — kill orphan, relaunch |
| Clicks pass through the HUD | Move the mouse onto the HUD first (hover arms it), or re-summon |

## Known limits (don't demo these)

- **Mic button** — needs `OPENAI_API_KEY` (Whisper); not configured. Voice mode
  still speaks replies aloud (macOS TTS fallback), input stays typed.
- **Full auto mouse control** — needs the Peekaboo binary; not installed.
  Guided walkthrough (ring + ghost cursor + user clicks) is the demo path.
- **Dashboard while ghost visible** — dismiss the ghost (double-shift) before
  clicking around the dashboard; the summoned overlay sits above it.

## Pre-demo smoke check (30 seconds, optional)

```bash
npm run test:specter   # 359 checks
curl -s http://127.0.0.1:8765/health   # {"status":"ok",...}
```
