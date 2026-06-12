# GhostWiki Acceptance Notes

## Project Summary
GhostTwin: a self-improving workflow wiki for your computer. It watches a workflow once, compiles it into a living wiki, answers questions from memory, lints what is missing, and improves itself when corrected.

## Required Hackathon Operations
- **Ingest**: PASS
- **Query**: PASS
- **Lint**: PASS
- **Backend/wiki-level self-improvement proof**: PASS
- **Full Electron feedback IPC path**: not separately E2E-tested

## Cognee Active Validation
Cognee active validation not run — fallback local markdown mode used for deterministic demo.

## UI-TARS
UI-TARS: skipped — optional fallback provider not implemented for this submission.

## macOS Validation
macOS live automation: not run unless actually validated with Screen Recording + Accessibility permissions.

## Known Limitations
- The full Electron IPC feedback path is not covered by an automated E2E test.
- Relies on local markdown parsing to mock out Cognee backend endpoints for consistency.
- npm audit reports unresolved dependency advisories; not remediated for hackathon demo.

## Final Command Outputs

### `python -m pytest memory_service/tests -q`
```
.....................                                                    [100%]
21 passed in 0.48s
```

### `npm run test:targetResolver`
```
> specter@1.0.0 test:targetResolver
> npx ts-node scripts/test-targetResolver.ts

PASS: Playwright priority 1
PASS: Peekaboo priority 2
PASS: Openara priority 3
PASS: AX priority 4
PASS: Vision priority 5
PASS: High conf vision does not require confirmation
PASS: Low conf vision requires confirmation
PASS: Manual fallback
8/8 targetResolver tests passed
```

### `npm run test:peekabooAdapter`
```
> specter@1.0.0 test:peekabooAdapter
> npx ts-node --transpile-only scripts/test-peekabooAdapter.ts

PASS: Non-macOS disabled
PASS: Commands disabled on non-macOS
PASS: USE_PEEKABOO=false disabled
PASS: Commands disabled via env
PASS: Binary missing handled
PASS: Binary missing command handled
PASS: Valid JSON parsing
PASS: Invalid JSON handled
PASS: Timeout handled
PASS: Nonzero exit handled
PASS: Args are passed as an array to spawn
PASS: shell: false is used
PASS: Text is passed as a single argument without shell interpretation
PASS: type arguments are correct
PASS: Args are passed as an array to spawn
PASS: shell: false is used
PASS: scroll arguments are correct
PASS: Args are passed as an array to spawn
PASS: shell: false is used
PASS: click by coords arguments are correct
PASS: element + snapshotId arguments are correct
PASS: element without snapshotId calls see --json and then click with snapshot
22/22 peekabooAdapter tests passed
```

### `npm run lint`
```
> specter@1.0.0 lint
> eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts

```

### `npm run build`
```
> specter@1.0.0 build
> electron-vite build

vite v5.4.21 building SSR bundle for production...
transforming...
✓ 52 modules transformed.
rendering chunks...
out/main/index.js  339.17 kB
✓ built in 830ms
vite v5.4.21 building SSR bundle for production...
transforming...
✓ 3 modules transformed.
rendering chunks...
out/preload/index.js     0.29 kB
out/preload/clinical.js  2.79 kB
out/preload/overlay.js   8.17 kB
✓ built in 30ms
vite v5.4.21 building for production...
transforming...
✓ 56 modules transformed.
rendering chunks...
../../out/renderer/index.html                     0.61 kB
../../out/renderer/overlay.html                   0.84 kB
../../out/renderer/clinical.html                  0.94 kB
../../out/renderer/assets/index-CbF0Bq6y.css      3.37 kB
../../out/renderer/assets/overlay-JxHm8q99.css   36.72 kB
../../out/renderer/assets/index-fbWnTBY3.js       3.13 kB
../../out/renderer/assets/clinical-9HT9jZCE.js   55.07 kB
../../out/renderer/assets/client-DD8NGkyR.js    214.36 kB
../../out/renderer/assets/overlay-Dj9z2i5D.js   219.13 kB
✓ built in 1.13s
```

### `bash scripts/demo-ghostwiki-e2e.sh`
```
Starting memory service in background...
Waiting for service to be healthy...
INFO:     127.0.0.1:57854 - "GET /health HTTP/1.1" 200 OK
INFO:     127.0.0.1:57858 - "GET /health HTTP/1.1" 200 OK
PASS: Health check
Calling /ingest...
INFO:     127.0.0.1:57864 - "POST /ingest HTTP/1.1" 200 OK
PASS: Ingest
Testing Luma Event Profile Queries...
INFO:     127.0.0.1:57866 - "POST /query HTTP/1.1" 200 OK
PASS: Host query returned correct details
INFO:     127.0.0.1:57878 - "POST /query HTTP/1.1" 200 OK
PASS: Prizes query returned correct details
INFO:     127.0.0.1:57894 - "POST /query HTTP/1.1" 200 OK
PASS: Schedule query returned correct details
Calling /query...
INFO:     127.0.0.1:57910 - "POST /query HTTP/1.1" 200 OK
PASS: Query returned step-by-step procedural answer with sources
Calling /lint...
INFO:     127.0.0.1:57914 - "POST /lint HTTP/1.1" 200 OK
PASS: Lint identified missing success condition
Running backend/wiki-level self-improvement proof...
Calling /query after correction...
INFO:     127.0.0.1:57924 - "POST /query HTTP/1.1" 200 OK
PASS: Backend/wiki-level self-improvement proof
All e2e tests PASSED!
Cleaning up memory service (PID: 5737)...
 INFO:     Started server process [5737]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8765 (Press CTRL+C to quit)
INFO:     Shutting down
INFO:     Waiting for application shutdown.
INFO:     Application shutdown complete.
INFO:     Finished server process [5737]
```
