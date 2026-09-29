#!/bin/bash
# Refresh the Safari extension's resources from the latest Chrome build,
# then rebuild the wrapper app. Run after any extension change you want in
# Safari. The Safari copy differs from Chrome's dist in exactly one way:
# Safari has no module service workers, so the background is bundled as a
# classic script into service-worker-loader.js and the manifest drops
# "type": "module".
set -euo pipefail
cd "$(dirname "$0")"

pnpm build

RES="safari/Speed Reader/Speed Reader Extension/Resources"
ESBUILD="$(ls -d ../../node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | head -1)"

rsync -a --delete dist/assets/ "$RES/assets/"
rsync -a --delete dist/src/ "$RES/src/"
"$ESBUILD" src/background.ts --bundle --format=iife --minify --outfile="$RES/service-worker-loader.js"
python3 - << 'PY'
import json
src = json.load(open("dist/manifest.json"))
src["background"] = {"service_worker": "service-worker-loader.js"}
json.dump(src, open("safari/Speed Reader/Speed Reader Extension/Resources/manifest.json", "w"), indent=2)
PY

cd "safari/Speed Reader"
xcodebuild -project "Speed Reader.xcodeproj" -scheme "Speed Reader" -configuration Release \
  -derivedDataPath /tmp/sr-safari-build -allowProvisioningUpdates build | tail -2
rm -rf "/Applications/Speed Reader.app"
cp -R "/tmp/sr-safari-build/Build/Products/Release/Speed Reader.app" /Applications/
echo "Safari app refreshed — restart Safari to pick up the new version."
