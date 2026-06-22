#!/usr/bin/env bash
#
# Baut die NEXUS-App (Demo-Modus) auf einem GitHub-Actions-Runner.
#
# Strategie: Wir erzeugen mit dem offiziellen React-Native-Template ein frisches
# Plattformprojekt (android/ bzw. ios/), spielen unseren App-Code (apps/nexus-mobile/src)
# darüber und legen die gebauten @nexus/*-Pakete direkt in node_modules ab. Der Demo-Modus
# benötigt KEIN natives Modul → der Build bleibt schlank und ohne Signing (Android: debug-APK).
#
# Aufruf: build-mobile.sh <android|ios>
set -euxo pipefail

PLATFORM="${1:?usage: build-mobile.sh android|ios}"
RN_VERSION="0.78.0"
ROOT="$(pwd)"
WORK="${RUNNER_TEMP:-/tmp}/nexusbuild"
ARTIFACTS="$ROOT/artifacts"

echo "::group::Shared @nexus-Pakete bauen"
corepack enable
pnpm install --frozen-lockfile
pnpm -r build
echo "::endgroup::"

echo "::group::React-Native-App scaffolden ($RN_VERSION)"
rm -rf "$WORK"
npx --yes @react-native-community/cli@latest init NEXUS \
  --version "$RN_VERSION" --directory "$WORK" --skip-install --skip-git-init true --pm npm
cd "$WORK"
echo "::endgroup::"

echo "::group::NEXUS-App-Code einspielen"
rm -f App.tsx
cp -R "$ROOT/apps/nexus-mobile/src" ./src
cp "$ROOT/apps/nexus-mobile/index.js" ./index.js
cp "$ROOT/apps/nexus-mobile/app.json" ./app.json
echo "::endgroup::"

echo "::group::Laufzeit-Abhängigkeiten installieren"
# Die Demo-App nutzt nur react/react-native (Navigation ist schlank in App.tsx) — daher
# keine zusätzlichen nativen Abhängigkeiten nötig.
npm install --legacy-peer-deps
echo "::endgroup::"

echo "::group::Gebaute @nexus-Pakete in node_modules verlinken"
# Laufzeit-Auflösung erfolgt über node_modules/@nexus/* (dist). Das umgeht
# workspace:-Protokoll/Registry vollständig.
for pkg in domain core-transport services ui-kit; do
  dest="node_modules/@nexus/$pkg"
  rm -rf "$dest"
  mkdir -p "$dest/dist"
  cp -R "$ROOT/packages/$pkg/dist/." "$dest/dist/"
  cp "$ROOT/packages/$pkg/package.json" "$dest/package.json"
done
echo "::endgroup::"

mkdir -p "$ARTIFACTS"

if [ "$PLATFORM" = "android" ]; then
  echo "::group::Android Debug-APK bauen"
  ( cd android && ./gradlew assembleDebug --no-daemon -x lint )
  cp android/app/build/outputs/apk/debug/app-debug.apk "$ARTIFACTS/nexus-demo-debug.apk"
  echo "APK: $ARTIFACTS/nexus-demo-debug.apk"
  echo "::endgroup::"
fi

if [ "$PLATFORM" = "ios" ]; then
  echo "::group::iOS-Build (Gerät, UNSIGNIERT → IPA zum Sideloaden)"
  ( cd ios && pod install )
  # Release-Build fürs echte Gerät, ohne Signing. Sideloadly/AltStore signiert die IPA
  # anschließend mit deiner kostenlosen Apple-ID neu (7-Tage-Sideload).
  xcodebuild \
    -workspace ios/NEXUS.xcworkspace \
    -scheme NEXUS \
    -configuration Release \
    -sdk iphoneos \
    -derivedDataPath ios-build \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    PROVISIONING_PROFILE_SPECIFIER="" \
    build
  APP_PATH="$(find ios-build/Build/Products/Release-iphoneos -maxdepth 1 -name '*.app' | head -1)"
  if [ -z "$APP_PATH" ]; then echo "Kein .app-Bundle gefunden"; exit 1; fi
  rm -rf Payload && mkdir Payload
  cp -R "$APP_PATH" Payload/
  zip -qry "$ARTIFACTS/nexus-demo-unsigned.ipa" Payload
  echo "IPA: $ARTIFACTS/nexus-demo-unsigned.ipa (unsigniert — mit Sideloadly aufs iPhone)"
  echo "::endgroup::"
fi
