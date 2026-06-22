# @nexus/mobile

React-Native-App (iOS/iPadOS/Android) für NEXUS. Konsumiert die plattformunabhängigen
Pakete `@nexus/domain`, `@nexus/core-transport`, `@nexus/services` und `@nexus/ui-kit`.

> ⚠️ **Nicht in der CI/Linux-Umgebung baubar.** Diese App benötigt die React-Native-
> Toolchain (Node + Metro), **Xcode** (iOS) bzw. das **Android SDK/NDK** sowie die nativen
> NEXUS-Module unter [`../../native`](../../native). Sie ist als lauffähiges Gerüst angelegt
> und wird verdrahtet, sobald die Toolchain verfügbar ist. Siehe
> [docs/11-Native-und-App.md](../../docs/11-Native-und-App.md).

## Architektur

```
src/
  native/
    NexusNative.ts     # Bridge-Spezifikation des nativen Kernmoduls (schmal)
    adapters.ts        # implementiert die @nexus/core-transport-Ports gegen das native Modul
  composition/
    container.ts       # Composition-Root: native Adapter + @nexus/services verdrahten
  screens/             # UI gegen die Services (ui-kit-Tokens)
  App.tsx              # Navigation + Initialisierung
```

Leitprinzip „Thin-JS / Native-Core" (ADR-001): UI/Orchestrierung in TS, sicherheits-/
performancekritische Pfade nativ (Keychain/Keystore, SQLCipher, EWS/EAS, Pinning).

## Modi (`src/config.ts` → `APP_MODE`)

- **`demo` (Standard):** In-Memory-Adapter + Beispieldaten — App läuft **sofort ohne Server
  und ohne native Module**. Ideal zum Ausprobieren auf Gerät/Simulator.
- **`live`:** native Module (Keychain/Keystore, SQLCipher, EWS-Transport) gegen Exchange.

## Inbetriebnahme (sobald Toolchain vorhanden)

1. `apps/*` in `pnpm-workspace.yaml` aufnehmen, dann `pnpm install`.
2. Für `demo`: direkt `pnpm --filter @nexus/mobile ios` bzw. `... android` — fertig.
3. Für `live`: native Module einbinden (iOS: Pods; Android: `NexusPackage` registrieren) —
   siehe [`../../native`](../../native) und [docs/11](../../docs/11-Native-und-App.md).
