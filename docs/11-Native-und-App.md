# Phase 10 — Native-Schicht & React-Native-App

> Diese Phase legt die **native Schicht** (Swift/Kotlin) und die **React-Native-App** an,
> die die in den TS-Paketen definierten Ports implementieren bzw. die `@nexus/services`
> konsumieren. Sie setzt das Leitprinzip „Thin-JS / Native-Core"
> ([ADR-001](./00-Architektur-Entscheidungen-ADR.md)) in konkreten Code um.

---

## ⚠️ Verifikations-Status (wichtig)

Diese Schicht ist in der **CI/Linux-Umgebung NICHT baubar oder testbar** — sie benötigt
**Xcode** (iOS/iPadOS/macOS), das **Android SDK/NDK** und die **React-Native-Toolchain**.
Sie ist als **realistisches Gerüst** angelegt: die sicherheitskritischen Teile
(Keychain/Keystore, DB-Schema, Bridge) sind vollständig, die umfangreichen Protokoll-Parser
(EWS-SOAP, EAS-WBXML) werden **iterativ** ergänzt. Die plattformunabhängige TypeScript-Hälfte
(`packages/*`) bleibt davon unberührt und weiterhin vollständig getestet/grün.

---

## Schichten & Verantwortlichkeiten

```mermaid
flowchart TB
    subgraph App["apps/nexus-mobile (React Native / TS)"]
        UI["Screens (ui-kit-Tokens)"]
        CR["composition/container.ts"]
        AD["native/adapters.ts — implementiert die Ports"]
        SPEC["native/NexusNative.ts — Bridge-Spec"]
    end
    subgraph Native["native/* (Swift / Kotlin)"]
        SEC["SecureStore (Keychain/Keystore)"]
        DB["SQLCipher-DB (dbInit/exec/query)"]
        TR["EWS/EAS-Transport + Autodiscover + Pinning"]
    end
    SVC["@nexus/services (Use-Cases)"]
    PORTS["@nexus/core-transport (Ports)"]

    UI --> CR --> SVC --> PORTS
    CR --> AD --> SPEC -. JS↔Native Bridge .-> Native
    AD -. implementiert .-> PORTS
    SEC & DB & TR --- Native
```

- **`apps/nexus-mobile/src/native/NexusNative.ts`** — schmale Bridge-Spezifikation des
  nativen Moduls (Secure-Storage, DB-Primitive, Transport). JSON über die Bridge.
- **`.../native/adapters.ts`** — `NativeSecureStore`, `SqlMailStore`, `NativeMailTransport`
  implementieren die Ports aus `@nexus/core-transport` auf Basis der Bridge.
- **`.../composition/container.ts`** — Composition-Root: verdrahtet die Adapter mit den
  `@nexus/services`. Austauschbar gegen die In-Memory-Adapter (Tests/Storybook).
- **`native/ios`, `native/android`** — die nativen Implementierungen (siehe jeweilige READMEs).

## Native-Modul-Oberfläche (Bridge)

| Bereich | Methoden |
|---------|----------|
| Secure-Storage | `secureSet/secureGet/secureDelete/secureWipe` |
| DB (SQLCipher) | `dbInit`, `dbExec(sql, params)`, `dbQuery(sql, params)` |
| Transport (EWS/EAS) | `transportDiscover`, `transportSyncMessages`, `transportApplyOperation`, `transportSendMessage`, `transportSearchServer` |

Die Store-Ports (`MailStore` …) werden in **JS als SQL** über `dbExec/dbQuery` realisiert;
die DB-Verschlüsselung und -Ausführung bleiben nativ. So bleibt die Bridge schmal und die
SQL-/Mapping-Logik plattformunabhängig.

## Status je Baustein

| Baustein | Status |
|----------|--------|
| **Demo-Modus** (In-Memory + Seed-Daten, App ohne Server lauffähig) | ✅ vollständig (TS-getestet) |
| iOS/Android SecureStore (Keychain/Keystore) | ✅ vollständig |
| DB-Schema (`messages`/`outbox`/FTS5) + Bridge | ✅ vollständig |
| RN-Bridge (Module/Package, Promise-basiert) | ✅ vollständig |
| JS-Adapter (Ports → Bridge) | ✅ vollständig (Messages/Outbox/Transport-Kern) |
| RN-App-Skelett (Navigation, 2 Screens, Container) | ✅ vollständig |
| **EWS-Transport — volle MailTransport-Oberfläche**: Autodiscover, Folder-/Message-/Calendar-/Contact-Sync, GetItem, CreateItem (Senden), applyOperation (markRead/flag/setCategories/move/delete), FindItem-Suche, loadAccount | 🟧 funktionale Implementierung in Swift **und** Kotlin (on-device zu testen/härten) |
| SQLCipher-Aufrufe aktiv schalten | ⏳ beim Einbinden der Abhängigkeit |
| EAS/WBXML, NTLM/Kerberos, Pinning-Verifikation (Fail-Closed) | ⏳ iterativ |

## App auf dem Handy testen

Diese Cloud-/Linux-Umgebung **baut die App nicht** — das geschieht auf deinem Rechner.
Es gibt zwei Modi (`apps/nexus-mobile/src/config.ts` → `APP_MODE`):

- **`demo` (Standard):** App startet mit In-Memory-Adaptern + Beispieldaten, **ohne Server
  und ohne native Module**. Schnellster Weg, NEXUS auf dem Gerät zu erleben (Liste, Lesen,
  lokale Suche, Regeln, Kategorien).
- **`live`:** nutzt die nativen Module (Keychain/Keystore, SQLCipher, EWS-Transport) gegen
  deinen Exchange-On-Prem-Server.

### iPhone (iOS)
1. **Mac mit Xcode** (15+) und CocoaPods.
2. Repo klonen → `apps/*` in `pnpm-workspace.yaml` aufnehmen → `pnpm install`.
3. `cd apps/nexus-mobile/ios && pod install` (für `live`: SQLCipher-Pod + Dateien aus
   `native/ios` ins Projekt aufnehmen).
4. In Xcode dein iPhone wählen, **Signing-Team** setzen (Apple-ID genügt, Sideload 7 Tage),
   **Run** — oder `pnpm --filter @nexus/mobile ios --device`.

### Android
1. **Android Studio + SDK** (min SDK 26), USB-Debugging am Handy aktivieren.
2. `pnpm install` (nach Workspace-Aufnahme), für `live`: Dateien aus `native/android` +
   Gradle-Abhängigkeiten, `NexusPackage` in `MainApplication` registrieren.
3. `pnpm --filter @nexus/mobile android` (installiert direkt aufs Gerät) oder APK bauen.

> Für **echten Mailabruf** (`live`) muss zusätzlich der EWS-Transport on-device getestet/
> gehärtet und dein Exchange-Server erreichbar sein (Autodiscover/Basic-Auth).

## Inbetriebnahme (sobald Toolchain vorhanden)

1. `apps/*` in `pnpm-workspace.yaml` aufnehmen → `pnpm install`.
2. iOS: SQLCipher-Pod + Dateien aus `native/ios` ins Xcode-Projekt; `pod install`.
3. Android: Gradle-Abhängigkeiten + Dateien aus `native/android`; `NexusPackage` registrieren.
4. `pnpm --filter @nexus/mobile ios` / `android`.
5. CI um die Native-Build-Matrix erweitern (macOS-Runner für iOS, SDK für Android) —
   vorbereitet als Kommentar in `.github/workflows/ci.yml`.
