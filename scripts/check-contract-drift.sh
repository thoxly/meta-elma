#!/usr/bin/env bash
set -euo pipefail

SEARCH_BIN="rg"
if ! command -v rg >/dev/null 2>&1; then
  SEARCH_BIN="grep"
fi

if "$SEARCH_BIN" -n "/connections/:id/semantic/generate" "apps/web/src/api.ts" >/dev/null; then
  echo "Found legacy endpoint /connections/:id/semantic/generate in apps/web/src/api.ts"
  exit 1
fi

if "$SEARCH_BIN" -n "/context/" "terraform/main.tf" >/dev/null; then
  echo "Found stale /context/* routes in terraform/main.tf"
  exit 1
fi

if "$SEARCH_BIN" -n "/debug/context" "terraform/main.tf" >/dev/null; then
  echo "Found stale /debug/context route in terraform/main.tf"
  exit 1
fi

echo "Contract drift checks passed."
