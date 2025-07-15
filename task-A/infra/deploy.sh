#!/usr/bin/env bash
# Build Lambda deployment package with dependencies + handler.
# Usage: ./deploy.sh
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
INFRA_DIR="$ROOT_DIR/infra"
BUILD_DIR="$(mktemp -d)"
PACKAGE_ZIP="$INFRA_DIR/deployment-package.zip"

# Clean previous artefact if present
rm -f "$PACKAGE_ZIP"

echo "[+] Installing Python dependencies into build dir"
uv pip install -r "$ROOT_DIR/requirements.txt" --target "$BUILD_DIR" --quiet

echo "[+] Copying lambda source code"
cp "$ROOT_DIR/src/handler.py" "$BUILD_DIR/"

pushd "$BUILD_DIR" >/dev/null
  echo "[+] Creating zip package: $PACKAGE_ZIP"
  zip -rq "$PACKAGE_ZIP" .
popd >/dev/null

echo "[✓] Deployment package created at $PACKAGE_ZIP"

# Cleanup
rm -rf "$BUILD_DIR"
