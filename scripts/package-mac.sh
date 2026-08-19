#!/bin/bash
set -e

APP_PATH="dist/mac-arm64/Digital Total Maintenance.app"
ZIP_PATH="dist/mac-arm64/Digital.Total.Maintenance.zip"

# bundled-python/ is generated output and is not tracked in git, so a fresh
# clone has no engine binaries to package. Fail before building rather than
# shipping an app whose Python helpers are missing.
MISSING_BINARIES=()

for module_file in modules/*.py; do
  module_name="$(basename "$module_file" .py)"

  if [ ! -x "bundled-python/$module_name" ]; then
    MISSING_BINARIES+=("$module_name")
  fi
done

if [ ${#MISSING_BINARIES[@]} -gt 0 ]; then
  echo "Missing bundled Python binaries: ${MISSING_BINARIES[*]}" >&2
  echo "Run ./scripts/build-python.sh before packaging." >&2
  exit 1
fi

npm run dist

xattr -cr "$APP_PATH"
find "$APP_PATH" -name "._*" -delete
find "$APP_PATH" -name ".DS_Store" -delete
dot_clean -m "$APP_PATH"

for helper in "$APP_PATH/Contents/Frameworks/"*.app; do
  xattr -cr "$helper"
  find "$helper" -name "._*" -delete
  find "$helper" -name ".DS_Store" -delete
  dot_clean -m "$helper"
  codesign --force --deep --sign - "$helper"
done

codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --verbose=2 "$APP_PATH"

ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"

echo "Created $ZIP_PATH"
