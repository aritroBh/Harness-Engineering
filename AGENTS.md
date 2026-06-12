# Agent playbook — Harness Engineering codebase

Guide for AI agents (Cursor, Claude Code, etc.) working in this repo.

## Code navigation: graphify first

This repo ships a prebuilt structural index at `graphify-out/graph.json` (classes, functions, imports, call graph). **Query it before blind grep.**

Skill: `.agents/skills/graphify/SKILL.md` (installed via `skills-lock.json`).

### One-time machine setup

```bash
npm i -g graphify-ts   # CLI
curl -fsSL https://bun.sh/install | bash   # graphify-ts runtime (if missing)
```

### Per-session workflow

1. **Find symbols** — `graphify query graphify-out/graph.json <name>`
2. **Read source** — open the file:line from query results
3. **After edits** — `graphify update graphify-out/graph.json <file1> [file2...]` or `graphify auto-update`
4. **Full rebuild** — `graphify build .` (run without `out/` present for a clean src-only index)

Install or refresh the skill from the lockfile:

```bash
npx skills add howell5/willhong-skills@graphify -y
```

Or use the helper script: `npm run graphify:setup`

## Architecture entry points

| Area | Start here |
| --- | --- |
| Electron main / IPC | `src/main/index.ts` |
| Overlay UI | `src/renderer/src/OverlayApp.tsx`, `src/renderer/overlay/` |
| AI planner | `src/main/ai/planner.ts` |
| Target resolution | `src/main/automation/targetResolver.ts` |
| GhostWiki panel | `src/renderer/overlay/GhostWikiPanel.tsx` |
| Memory sidecar API | `memory_service/app.py` (`/ingest`, `/query`, `/lint`) |
| Wiki store + lint | `memory_service/wiki_store.py`, `memory_service/lint_engine.py` |
| Dashboard | `src/renderer/dashboard/DashboardApp.tsx` |
| Tests | `scripts/test-specter.ts`, `memory_service/tests/` |

## Proactive context (no-prompt summon)

Specter tracks foreground app, window title, browser URL, typed text, clipboard, voice, and uiohook activity. On double-shift summon it auto-predicts intent via GhostWiki + Claude.

| Env var | Default | Meaning |
| --- | --- | --- |
| `SPECTER_PROACTIVE_PREDICT` | `true` | Auto-prediction on overlay open |
| `SPECTER_AMBIENT_AUDIO` | `false` | Background mic snippets → Whisper (opt-in) |

IPC: `context:get`, `context:refresh`, `proactive:predict`

Persisted history: `~/Library/Application Support/Specter/context-history.json`

## Conventions

- **TypeScript** — Electron main in `src/main/`, React renderer in `src/renderer/`
- **Python** — FastAPI sidecar in `memory_service/` (port `8765`)
- **Do not commit** — `.env`, `out/`, `node_modules/`, generated `query_*_response.json` artifacts
- **Do commit** — `graphify-out/graph.json` when structure changes meaningfully

## Verification before claiming done

```bash
npm run security-check
npm run test:specter
python -m pytest memory_service/tests -q
npm run lint && npm run build
```

See `README.md` and `DEMO_RUNBOOK.md` for demo flows.
