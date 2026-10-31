#!/bin/sh
# Legacy scheduler compatibility. Internal fixture cycle only: no Codex child,
# approval bypass, .env loading, hosted queue preparation or external send/publish.
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
exec node "$SCRIPT_DIR/../scripts/growth-cycle.mjs" --dry-run
