#!/bin/bash
set -euo pipefail

CORRECTION_FILE="demo-workflows/event-recap/wiki/correction-e2e.md"
rm -f "$CORRECTION_FILE"

export COGNEE_ENABLED=false
export GHOSTWIKI_WIKI_ROOT=./demo-workflows/event-recap/wiki
export MEMORY_SERVICE_PORT=8765

echo "Starting memory service in background..."
python -m uvicorn memory_service.app:app --port $MEMORY_SERVICE_PORT &
MEMORY_SERVICE_PID=$!

function cleanup {
  rm -f "$CORRECTION_FILE"
  echo "Cleaning up memory service (PID: $MEMORY_SERVICE_PID)..."
  kill $MEMORY_SERVICE_PID || true
}
trap cleanup EXIT

echo "Waiting for service to be healthy..."
for i in {1..10}; do
  if curl -s http://127.0.0.1:$MEMORY_SERVICE_PORT/health >/dev/null; then
    break
  fi
  sleep 1
done

HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$MEMORY_SERVICE_PORT/health)
if [ "$HEALTH_STATUS" != "200" ]; then
    echo "FAIL: Health check failed with status $HEALTH_STATUS"
    cleanup
    exit 1
fi
echo "PASS: Health check"

echo "Calling /ingest..."
INGEST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"files": []}' http://127.0.0.1:$MEMORY_SERVICE_PORT/ingest)
if [ "$INGEST_STATUS" != "200" ]; then
    echo "FAIL: Ingest failed with status $INGEST_STATUS"
    cleanup
    exit 1
fi
echo "PASS: Ingest"

echo "Testing Luma Event Profile Queries..."

# 1. Who hosted the event?
curl -s -X POST -H "Content-Type: application/json" -d '{"query": "Who hosted the event?"}' http://127.0.0.1:$MEMORY_SERVICE_PORT/query > query_host_response.json
python -c "
import sys, json
try:
    with open('query_host_response.json', 'r') as f:
        data = json.load(f)
    answer = data.get('answer', '').lower()
    if 'cognee' not in answer or ('nicole levin' not in answer and 'pebblebed vc' not in answer):
        print('FAIL: Host query did not include cognee and Nicole Levin or Pebblebed VC. Answer was: ' + answer)
        sys.exit(1)
    print('PASS: Host query returned correct details')
except Exception as e:
    print(f'FAIL: Python json parsing failed: {e}')
    sys.exit(1)
" || { cleanup; exit 1; }

# 2. What prizes are available?
curl -s -X POST -H "Content-Type: application/json" -d '{"query": "What prizes are available?"}' http://127.0.0.1:$MEMORY_SERVICE_PORT/query > query_prizes_response.json
python -c "
import sys, json
try:
    with open('query_prizes_response.json', 'r') as f:
        data = json.load(f)
    answer = data.get('answer', '').lower()
    if '800' not in answer or '500' not in answer or '200' not in answer:
        print('FAIL: Prizes query did not include \$800, \$500, \$200. Answer was: ' + answer)
        sys.exit(1)
    print('PASS: Prizes query returned correct details')
except Exception as e:
    print(f'FAIL: Python json parsing failed: {e}')
    sys.exit(1)
" || { cleanup; exit 1; }

# 3. What is the schedule?
curl -s -X POST -H "Content-Type: application/json" -d '{"query": "What is the schedule?"}' http://127.0.0.1:$MEMORY_SERVICE_PORT/query > query_schedule_response.json
python -c "
import sys, json
try:
    with open('query_schedule_response.json', 'r') as f:
        data = json.load(f)
    answer = data.get('answer', '').lower()
    if '4:30' not in answer or '5:00' not in answer or '5:30' not in answer or '6:00' not in answer:
        print('FAIL: Schedule query did not include 4:30, 5:00, 5:30, 6:00. Answer was: ' + answer)
        sys.exit(1)
    print('PASS: Schedule query returned correct details')
except Exception as e:
    print(f'FAIL: Python json parsing failed: {e}')
    sys.exit(1)
" || { cleanup; exit 1; }


echo "Calling /query..."
QUERY_PAYLOAD='{"query": "How do I create a calendar event from this event page?"}'
curl -s -X POST -H "Content-Type: application/json" -d "$QUERY_PAYLOAD" http://127.0.0.1:$MEMORY_SERVICE_PORT/query > query_response.json

python -c "
import sys, json

try:
    with open('query_response.json', 'r') as f:
        data = json.load(f)
    answer = data.get('answer', '').lower()
    sources = data.get('sources', [])

    if len(sources) == 0:
        print('FAIL: Sources are empty')
        sys.exit(1)

    if 'no relevant information' in answer or 'no explicit steps' in answer:
        print('FAIL: Answer is generic')
        sys.exit(1)

    required_terms = ['create event', 'title', 'date', 'time', 'location', 'host']
    for term in required_terms:
        if term not in answer:
            print(f'FAIL: Answer missing {term}')
            sys.exit(1)

    print('PASS: Query returned step-by-step procedural answer with sources')
except Exception as e:
    print(f'FAIL: Python json parsing failed: {e}')
    sys.exit(1)
" || { cleanup; exit 1; }

echo "Calling /lint..."
curl -s -X POST -H "Content-Type: application/json" -d '{}' http://127.0.0.1:$MEMORY_SERVICE_PORT/lint > lint_response.json
python -c "
import sys, json

try:
    with open('lint_response.json', 'r') as f:
        data = json.load(f)
    issues = data.get('issues', [])

    if len(issues) == 0:
        print('FAIL: Lint has no issues')
        sys.exit(1)

    found_success_condition = False
    for issue in issues:
        if isinstance(issue, str):
            text = issue
        else:
            text = str(issue.get('rule', '')) + ' ' + str(issue.get('message', ''))

        if 'missing' in text.lower() and 'success' in text.lower() and 'condition' in text.lower():
            found_success_condition = True
            break

    if not found_success_condition:
        print('FAIL: Lint did not include missing success condition issue')
        sys.exit(1)

    print('PASS: Lint identified missing success condition')
except Exception as e:
    print(f'FAIL: Python json parsing failed: {e}')
    sys.exit(1)
" || { cleanup; exit 1; }

echo "Running backend/wiki-level self-improvement proof..."
cat << 'EOF' > demo-workflows/event-recap/wiki/correction-e2e.md
Feedback received: **missing-step**

Correction Text: The workflow needs a success condition confirming the calendar event was saved.

Reference: [[workflow-event-recap-session-1]]
EOF

echo "Calling /query after correction..."
curl -s -X POST -H "Content-Type: application/json" -d "$QUERY_PAYLOAD" http://127.0.0.1:$MEMORY_SERVICE_PORT/query > query_response2.json
python -c "
import sys, json

try:
    with open('query_response2.json', 'r') as f:
        data = json.load(f)
    answer = data.get('answer', '').lower()
    sources = data.get('sources', [])

    if 'success condition' not in answer and 'calendar event was saved' not in answer:
        print('FAIL: Answer does not include success condition correction')
        sys.exit(1)

    correction_found = False
    for s in sources:
        if 'correction' in s.get('title', '').lower() or 'correction' in s.get('content', '').lower():
            correction_found = True
            break

    if not correction_found:
        print('FAIL: Sources do not include correction page')
        sys.exit(1)

    print('PASS: Backend/wiki-level self-improvement proof')
except Exception as e:
    print(f'FAIL: Python json parsing failed on second query: {e}')
    sys.exit(1)
" || { cleanup; exit 1; }

echo "All e2e tests PASSED!"
