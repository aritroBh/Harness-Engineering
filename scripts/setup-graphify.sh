#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> graphify setup for Specter"

if ! command -v bun >/dev/null 2>&1; then
  echo "Installing Bun (graphify-ts runtime)..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="${HOME}/.bun/bin:${PATH}"
fi

if ! command -v graphify >/dev/null 2>&1; then
  echo "Installing graphify-ts CLI..."
  npm i -g graphify-ts
fi

echo "==> Installing graphify skill from skills-lock.json"
npx skills add howell5/willhong-skills@graphify -y

if [[ -d out ]]; then
  echo "==> Temporarily moving out/ for clean src-only index"
  mv out /tmp/specter-out-graphify-backup-$$
  trap 'mv /tmp/specter-out-graphify-backup-$$ out 2>/dev/null || true' EXIT
fi

echo "==> Building graph index"
graphify build .

echo "==> Done. Indexed graph at graphify-out/graph.json"
graphify query graphify-out/graph.json OverlayApp | head -3
