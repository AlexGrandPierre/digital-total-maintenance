#!/bin/bash
#
# build-python.sh
#
# Rebuilds the bundled Python engine binaries used by packaged releases.
#
# Every module in modules/ is a CLI entry point invoked by the Electron main
# process, so the build list is derived from that directory rather than being
# hardcoded. Adding a new module requires no change here.
#
# PyInstaller output is written to a temporary work directory instead of dist/,
# because dist/ holds the Vite frontend build that electron-builder packages
# via "files": ["dist/**"]. Binaries are copied into bundled-python/ only after
# every build succeeds, so a failed run cannot leave a half-updated engine.
#
# Usage: ./scripts/build-python.sh   (from the repository root)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

MODULES=()
for module_file in modules/*.py; do
  MODULES+=("$(basename "$module_file" .py)")
done

echo "Building ${#MODULES[@]} Python binaries..."

for module in "${MODULES[@]}"; do
  echo "  building $module"
  pyinstaller --onefile --noconfirm --log-level WARN \
    --name "$module" \
    --distpath "$WORK_DIR/out" \
    --workpath "$WORK_DIR/work" \
    --specpath "$WORK_DIR/spec" \
    "modules/$module.py"
done

# Only publish once all builds have succeeded.
mkdir -p bundled-python

for module in "${MODULES[@]}"; do
  cp "$WORK_DIR/out/$module" "bundled-python/$module"
done

echo "Updated bundled-python/ with ${#MODULES[@]} binaries."
