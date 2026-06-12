# Memory Service

## Setup Commands
```bash
pip install -r requirements.txt
```

## Environment Variables
* `COGNEE_ENABLED`: true/false (false forces fallback mode)
* `GHOSTWIKI_WIKI_ROOT`: path to the wiki root (e.g., `./demo-workflows/event-recap/wiki`)
* `MEMORY_SERVICE_PORT`: port for the service (default: 8765)

## Endpoint List
* `GET /health`
* `POST /ingest`
* `POST /query`
* `POST /lint`

## Cognee Mode vs Fallback Mode
* **Cognee Mode**: Active when `COGNEE_ENABLED=true`. Uses Cognee.
* **Fallback Mode**: Active when `COGNEE_ENABLED=false`. Uses local markdown search.

## Test Command
```bash
python -m pytest memory_service/tests
```
