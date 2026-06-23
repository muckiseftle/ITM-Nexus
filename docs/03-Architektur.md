# Phase 3 — Systemarchitektur

> Vollständige Architektur von NEXUS. Grundlage sind die verbindlichen
> [Architektur-Entscheidungen (ADR)](./00-Architektur-Entscheidungen-ADR.md). Leitprinzip:
> **„Thin-JS / Native-Core"** — UI/Orchestrierung in React Native, kritische Pfade nativ.

---

## 1. Architekturziele & -prinzipien

| Ziel | Umsetzung |
|------|-----------|
| **Performance** | Native-Core, Offline-First-DB, FTS5-Suche, kein JS-Bridge im heißen Pfad |
| **Sicherheit** | SQLCipher, Keychain/Keystore, Pinning, S/MIME, Sandbox-Isolation |
| **Offline** | Lokale Wahrheit (DB), Outbox, Delta-Sync, idempotente Operationen |
| **Wartbarkeit** | Schichtentrennung, Transport-Abstraktion, Monorepo, strikte Typen |
| **Skalierbarkeit** | Protokoll-agnostische Transport-Schicht, austauschbare Connectoren |
| **Portabilität** | Geteilte TS-Domäne; plattformspezifische native Module hinter Interfaces |

**Architekturregeln (verbindlich):**
1. Keine Mailinhalte über Dritt-Clouds. Gerät ↔ Exchange direkt.
2. Security-/Krypto-/Protokoll-Logik **nie** in JS.
3. Obere Schichten kennen kein konkretes Protokoll — nur die `MailTransport`-Abstraktion.
4. Jede Server-Operation ist **idempotent** und über die Outbox wiederholbar.
5. Lesen erfolgt **immer** aus der lokalen DB (nie blockierend vom Netz).

---

## 2. Schichtenmodell (System-Architektur)

```mermaid
flowchart TB
    subgraph UI["🟦 Präsentationsschicht — React Native / TypeScript"]
        Screens["Screens & Navigation"]
        UIKit["UI-Kit / Design System"]
        VM["ViewModels / State (Redux-Toolkit o. Zustand)"]
    end

    subgraph Bridge["🔌 Native-Bridge (TurboModules / JSI)"]
        API["Typsichere Modul-Verträge"]
    end

    subgraph Core["🟩 Native-Core (Swift / Kotlin)"]
        direction TB
        Transport["MailTransport-Abstraktion"]
        EWS["EWS-Connector (SOAP/XML)"]
        EAS["EAS-Connector (WBXML, Direct Push)"]
        AD["Autodiscover"]
        Sync["Sync-Engine + Outbox"]
        Search["Such-Indexer (FTS5)"]
        Crypto["Krypto / S/MIME / Pinning"]
        Secure["Secure-Storage (Keychain/Keystore)"]
        Push["Push-Handler (APNs/FCM/Direct)"]
        MDM["MDM / AppConfig"]
    end

    subgraph Data["🟨 Datenschicht"]
        DB[("SQLCipher-DB\nMails·Kalender·Kontakte·Index")]
        Files[("Verschlüsselter\nAttachment-Store")]
    end

    Server[["🏢 Exchange On-Premises"]]

    Screens --> VM --> API
    UIKit --> Screens
    API --> Transport
    Transport --> EWS & EAS & AD
    Transport --> Sync
    Sync --> DB
    Search --> DB
    Crypto --> Secure
    EWS & EAS --> Crypto
    Sync --> Files
    EWS & EAS & AD & Push <-->|TLS + Pinning| Server
    MDM -.Policies.-> Core
```

---

## 3. Moduldiagramm

```mermaid
flowchart LR
    subgraph apps["apps/"]
        mobile["nexus-mobile\n(iOS/iPadOS/Android)"]
        desktop["nexus-desktop\n(RN-macOS)"]
    end

    subgraph packages["packages/ (TypeScript)"]
        domain["domain\n(Modelle, ViewModels)"]
        transportTypes["core-transport\n(Interfaces, DTOs)"]
        uikit["ui-kit\n(Design System)"]
    end

    subgraph native["native/"]
        ios["ios (Swift)\nTransport·Crypto·Sync·Store"]
        android["android (Kotlin)\nTransport·Crypto·Sync·Store"]
    end

    mobile --> domain & uikit & transportTypes
    desktop --> domain & uikit & transportTypes
    domain --> transportTypes
    mobile -. TurboModule .-> ios
    mobile -. TurboModule .-> android
    desktop -. TurboModule .-> ios
```

**Verantwortlichkeiten:**

| Modul | Verantwortung |
|-------|---------------|
| `apps/nexus-mobile` | RN-App-Schale, Plattform-Konfiguration iOS/iPadOS/Android |
| `apps/nexus-desktop` | RN-macOS-Schale (teilt Screens/Domäne) |
| `packages/domain` | Plattformunabhängige Domänenmodelle & ViewModel-Logik |
| `packages/core-transport` | `MailTransport`-Interface, DTOs, EWS/EAS-Typen (TS-Seite) |
| `packages/ui-kit` | Design-System-Komponenten (siehe [Phase 5](./05-UX-und-Design.md)) |
| `native/ios` | Swift-Implementierung aller Native-Core-Fähigkeiten |
| `native/android` | Kotlin-Implementierung aller Native-Core-Fähigkeiten |

---

## 4. Datenflüsse

### 4.1 Autodiscover → Login

```mermaid
sequenceDiagram
    participant U as Nutzer
    participant UI as RN-UI
    participant AD as Autodiscover (native)
    participant KC as Keychain/Keystore
    participant EX as Exchange

    U->>UI: E-Mail + Passwort
    UI->>AD: discover(email)
    AD->>EX: POX/SOAP Autodiscover (TLS+Pinning)
    EX-->>AD: EWS-URL, EAS-Server, Fähigkeiten
    AD->>EX: Auth-Test (NTLM/Basic/OAuth je Konfig)
    EX-->>AD: 200 OK
    AD->>KC: Credentials/Token sicher ablegen
    AD-->>UI: Konto bereit
    UI-->>U: Erst-Sync startet
```

### 4.2 Mail-Sync (hybrid EAS-Push + EWS-Detail)

```mermaid
sequenceDiagram
    participant EX as Exchange
    participant P as Push/Direct-Push (native)
    participant S as Sync-Engine (native)
    participant DB as SQLCipher-DB
    participant IDX as FTS-Indexer
    participant UI as RN-UI

    EX-->>P: Direct-Push: Änderung im Postfach
    P->>S: trigger(folderId)
    S->>EX: EAS Sync(SyncKey) → geänderte Item-IDs
    S->>EX: EWS GetItem (Header/Body/MIME) für Details
    EX-->>S: Item-Daten
    S->>DB: upsert (verschlüsselt)
    S->>IDX: index(plaintext-Extrakt)
    S-->>UI: DB-Change-Event
    UI-->>UI: Liste aktualisiert (reaktiv)
```

### 4.3 Offline-Aktion → Outbox → Server (Optimistic UI)

```mermaid
sequenceDiagram
    participant U as Nutzer
    participant UI as RN-UI
    participant DB as SQLCipher-DB
    participant OB as Outbox
    participant S as Sync-Worker
    participant EX as Exchange

    U->>UI: Mail verschieben/senden/flaggen
    UI->>DB: lokale Änderung sofort anwenden
    UI->>OB: Operation persistieren (idempotent)
    UI-->>U: sofortiges Feedback (optimistic)
    Note over OB,S: später / bei Netz
    S->>OB: nächste Operation
    S->>EX: ausführen (EWS/EAS)
    alt Erfolg
        EX-->>S: OK
        S->>OB: Operation entfernen
    else Konflikt/Fehler
        EX-->>S: Fehler
        S->>OB: Backoff/Retry oder Konfliktkopie
    end
```

### 4.4 Suche (lokal-first, hybrid)

```mermaid
flowchart LR
    Q["Suchanfrage"] --> L["FTS5 lokaler Index"]
    L --> R1["Sofort-Ergebnisse < 200 ms"]
    Q -. optional .-> SS["EWS FindItem / AQS (Server)"]
    SS --> R2["Server-Treffer (nicht lokal gecacht)"]
    R1 & R2 --> M["Merge & Dedupe"] --> UI["Ergebnisliste"]
```

---

## 5. Wichtige Querschnittsthemen

### 5.1 Skalierbarkeit
- **Protokoll-Skalierung:** Transport-Abstraktion erlaubt das Hinzufügen eines
  Graph-Connectors ohne Änderung der oberen Schichten.
- **Datenmengen:** konfigurierbare Sync-Fenster (Zeit/Ordner), Attachment-Lazy-Loading
  mit LRU-Eviction, Paginierung großer Ordner.
- **Mehrkonten:** DB-Schema mit `accountId`-Partitionierung von Beginn an.

### 5.2 Wartbarkeit
- Strikte Schichtengrenzen; Abhängigkeiten zeigen nur „nach unten".
- Geteilte Typen (`core-transport`) verhindern Drift zwischen JS und nativ.
- ADR-getriebene Entscheidungen, dokumentiert und versioniert.

### 5.3 Performance-Budget (Zielwerte)
| Interaktion | Zielwert |
|-------------|----------|
| App-Kaltstart bis Liste | < 1,2 s |
| Öffnen einer Mail (gecacht) | < 100 ms |
| Lokale Suche (erste Treffer) | < 200 ms |
| Scroll Inbox (1000+ Mails) | 60 fps, kein Jank |
| Hintergrund-Sync-Wakeup | akkuschonend, gebündelt |

### 5.4 Fehler-/Resilienz-Strategie
- Exponentielles Backoff für Netz/Sync; idempotente Outbox; klare Offline-Indikatoren.
- Krypto-/Auth-Fehler werden nutzerverständlich gemeldet, nie still verschluckt.

---

## 6. Technologie-Bausteine (Zusammenfassung)

| Belang | Technologie |
|--------|-------------|
| UI-Framework | React Native CLI (+ RN-macOS) |
| Sprache UI | TypeScript (`strict`) |
| State | Redux Toolkit **oder** Zustand (Festlegung in Phase 10) |
| Native | Swift (iOS/macOS), Kotlin (Android) |
| Bridge | TurboModules / JSI |
| DB | SQLite + **SQLCipher** |
| Suche | SQLite **FTS5** |
| Secure-Storage | Keychain (iOS/macOS) / Android Keystore |
| Transport | EWS (SOAP/XML) + EAS (WBXML) + Autodiscover |
| Krypto/S/MIME | native Plattform-Krypto + S/MIME-Bibliotheken |
| Push | APNs / FCM (Weck-Signal) + EAS Direct Push |
| Build/Monorepo | pnpm Workspaces (+ Nx/Turborepo) |

> Detaillierte Sicherheitsarchitektur: siehe [Phase 4 — Security-Konzept](./04-Security-Konzept.md).
