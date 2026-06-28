module.exports = {
  presets: ['@react-native/babel-preset'],
  // WICHTIG: Das Reanimated-Plugin MUSS das letzte Plugin sein (Worklet-Transform). Fehlt es,
  // kompiliert die App grün, stürzt aber am Gerät beim ersten Worklet ab. Der CI-Build kopiert
  // diese Datei deshalb mit ins frische RN-Scaffold (siehe .github/scripts/build-mobile.sh).
  plugins: ['react-native-reanimated/plugin'],
};
