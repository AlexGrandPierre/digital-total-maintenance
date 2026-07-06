#!/bin/bash
set -e

APP_PATH="dist/mac-arm64/Digital Total Maintenance.app"
ZIP_PATH="dist/mac-arm64/Digital.Total.Maintenance.zip"

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
