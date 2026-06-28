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
# babel.config.js MIT übernehmen — enthält das reanimated/plugin (Worklet-Transform). Ohne diese
# Datei nutzt Metro die Scaffold-Default-Config OHNE Plugin: kompiliert grün, crasht am Gerät.
# metro.config.js bewusst NICHT kopieren (dessen watchFolders zeigt auf den hier fehlenden Monorepo-Root).
cp "$ROOT/apps/nexus-mobile/babel.config.js" ./babel.config.js
echo "::endgroup::"

echo "::group::App-Icon einspielen"
ICONS="$ROOT/apps/nexus-mobile/assets"
# iOS: Asset-Catalog-AppIcon ersetzen (einzelnes 1024er-Icon, Xcode erzeugt die Größen).
if [ -d "ios/NEXUS/Images.xcassets" ]; then
  rm -rf "ios/NEXUS/Images.xcassets/AppIcon.appiconset"
  cp -R "$ICONS/ios/AppIcon.appiconset" "ios/NEXUS/Images.xcassets/AppIcon.appiconset"
fi
# Android: Mipmaps je Dichte ersetzen + adaptive XML entfernen (sonst Standard-Robot-Icon).
if [ -d "android/app/src/main/res" ]; then
  ARES="android/app/src/main/res"
  # Portabel (macOS-bash 3.2 hat kein declare -A): Dichte:Pixel-Paare.
  for pair in "mdpi:48" "hdpi:72" "xhdpi:96" "xxhdpi:144" "xxxhdpi:192"; do
    d="${pair%%:*}"; px="${pair##*:}"
    mkdir -p "$ARES/mipmap-$d"
    cp "$ICONS/icon/icon-$px.png" "$ARES/mipmap-$d/ic_launcher.png"
    cp "$ICONS/icon/icon-$px.png" "$ARES/mipmap-$d/ic_launcher_round.png"
  done
  rm -f "$ARES"/mipmap-anydpi-v26/ic_launcher*.xml
fi
echo "::endgroup::"

echo "::group::Laufzeit-Abhängigkeiten installieren"
# Basis (react/react-native aus dem Scaffold) installieren …
npm install --legacy-peer-deps
# … und die UI-Abhängigkeiten des Redesigns explizit nachinstallieren. WICHTIG: Das Scaffold
# liest NICHT die App-package.json (nur src/index.js/app.json/babel.config.js werden kopiert),
# daher müssen diese hier installiert werden, damit RN-Autolinking sie beim `pod install` findet.
npm install --legacy-peer-deps \
  react-native-svg@^15.8.0 \
  react-native-reanimated@~3.17.0 \
  react-native-gesture-handler@^2.22.0
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

if [ "$PLATFORM" = "ios-live" ]; then
  echo "::group::Natives iOS-Modul (NexusNative-Pod) integrieren"
  # Live-Modus aktivieren (echtes Exchange via native Module).
  sed -i '' "s/APP_MODE: 'demo' | 'live' = 'demo'/APP_MODE: 'demo' | 'live' = 'live'/" src/config.ts || \
    sed -i "s/APP_MODE: 'demo' | 'live' = 'demo'/APP_MODE: 'demo' | 'live' = 'live'/" src/config.ts
  # Den lokalen Pod in den App-Target-Block der Podfile eintragen.
  # SQLCipher (C-Pod ohne Module-Map) braucht :modular_headers => true, damit der
  # Swift-Pod NexusNative es per `import SQLCipher` einbinden kann (sonst bricht
  # `pod install` mit „cannot yet be integrated as static libraries" ab).
  ROOT="$ROOT" ruby -e '
    path = File.join(ENV["ROOT"], "native", "ios")
    pf = "ios/Podfile"
    out = []
    File.readlines(pf).each do |l|
      out << l
      if l =~ /target .NEXUS. do/
        out << "  pod \x27SQLCipher\x27, :modular_headers => true\n"
        out << "  pod \x27NexusNative\x27, :path => \x27#{path}\x27\n"
      end
    end
    File.write(pf, out.join)
  '
  cat ios/Podfile | grep -n "NexusNative\|SQLCipher" || true

  # Background-Sync (BGTaskScheduler): Info.plist-Modi + erlaubte Task-IDs, AppDelegate-Wiring.
  PLIST="ios/NEXUS/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :UIBackgroundModes array" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:0 string fetch" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :UIBackgroundModes:1 string processing" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :BGTaskSchedulerPermittedIdentifiers array" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :BGTaskSchedulerPermittedIdentifiers:0 string de.itm.nexus.refresh" "$PLIST" 2>/dev/null || true
  # Face-ID-Nutzungsbeschreibung (Pflicht — sonst Absturz beim ersten LAContext-Aufruf mit Face ID).
  /usr/libexec/PlistBuddy -c "Add :NSFaceIDUsageDescription string 'NEXUS nutzt Face ID, um die App zu entsperren.'" "$PLIST" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Set :NSFaceIDUsageDescription 'NEXUS nutzt Face ID, um die App zu entsperren.'" "$PLIST" 2>/dev/null || true
  # BGTask-Handler VOR Ende von didFinishLaunchingWithOptions registrieren (iOS-Vorgabe).
  ruby -e '
    p = "ios/NEXUS/AppDelegate.swift"
    if File.exist?(p)
      s = File.read(p)
      # Pod-Modul importieren (NexusBackgroundSync ist im NexusNative-Modul, public).
      # Immer sicherstellen, dass der Import vorhanden ist (sonst unaufgelöstes Symbol).
      unless s.include?("import NexusNative")
        if s =~ /^import UIKit\n/
          s = s.sub(/^(import UIKit\n)/) { $1 + "import NexusNative\n" }
        else
          s = "import NexusNative\n" + s
        end
      end
      unless s.include?("NexusBackgroundSync.register()")
        s = s.sub(/(didFinishLaunchingWithOptions[^\n]*\{\n)/) { $1 + "    NexusBackgroundSync.register()\n" }
      end
      File.write(p, s)
    end
  '
  grep -n "NexusBackgroundSync\|UIBackgroundModes" ios/NEXUS/AppDelegate.swift "$PLIST" || true
  echo "::endgroup::"

  echo "::group::iOS-Live-Build (Gerät, UNSIGNIERT, mit nativem Modul)"
  ( cd ios && pod install )
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
  zip -qry "$ARTIFACTS/nexus-live-unsigned.ipa" Payload
  echo "IPA: $ARTIFACTS/nexus-live-unsigned.ipa (LIVE, unsigniert — mit Sideloadly aufs iPhone)"
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
