# Architektur-Entscheidungen (ADR)

> Architecture Decision Records für NEXUS. Jede ADR ist verbindlich, bis sie durch eine
> neue ADR ersetzt (Status: *Superseded*) wird. Format: **Status / Kontext / Entscheidung
> / Konsequenzen / Alternativen**.

| ADR | Titel | Status |
|-----|-------|--------|
| 001 | Tech-Stack: React Native + Native-Core | ✅ Akzeptiert |
| 002 | Exchange-Transport: EWS + EAS hybrid + Autodiscover | ✅ Akzeptiert |
| 003 | Offline-Datenhaltung & Sync-Modell | ✅ Akzeptiert |
| 004 | Suchindizierung (lokaler FTS-Index) | ✅ Akzeptiert |
| 005 | Verschlüsselung at-rest & Key-Management | ✅ Akzeptiert |
| 006 | Monorepo-Strategie | ✅ Akzeptiert |
| 007 | Push-Benachrichtigungen ohne Cloud-Tracking | ✅ Akzeptiert |

---

## ADR-001 — Tech-Stack: React Native + Native-Core

**Status:** ✅ Akzeptiert (Auftraggeber-Entscheidung: React Native CLI; 4 Plattformen)

### Kontext
NEXUS muss auf **iOS, iPadOS, macOS und Android** laufen und gleichzeitig „schneller und
sicherer als Outlook" sein. Native Entwicklung pro Plattform liefert maximale
Performance/Sicherheit, aber 2–4× Entwicklungsaufwand. React Native liefert eine
gemeinsame Codebasis, ist aber für Krypto, Background-Sync, MDM und Protokoll-Parsing
schwächer und bringt JS-Bridge-Overhead mit.

### Entscheidung
**React Native CLI** (nicht Expo — wir brauchen volle Kontrolle über native Module und
Build-Pipeline) als UI- und Orchestrierungsschicht, ergänzt durch ein verbindliches
Prinzip **„Thin-JS / Native-Core"**:

- **In JS/TypeScript:** Screens, Navigation, State-Orchestrierung, Geschäftslogik der
  Darstellung, Formularvalidierung, leichte ViewModels.
- **In nativen Modulen (Swift/Kotlin, C/C++ wo sinnvoll):**
  - Secure-Storage (Keychain / Android Keystore)
  - Lokale DB-Verschlüsselung (SQLCipher) & Krypto-Primitive
  - S/MIME (Signatur/Verschlüsselung, Zertifikatsketten)
  - TLS-Stack & **Certificate Pinning**
  - **Exchange-Protokoll-Engine** (EWS-SOAP, EAS-WBXML) — parsing- und CPU-intensiv
  - **Background-Sync-Worker** (BGTaskScheduler / WorkManager)
  - Push (APNs/Direct-Push) & MDM-Integration (AppConfig/Managed App Config)
  - HTML-Sanitizing & Rendering-Härtung

### Konsequenzen
- ➕ Eine UI-Codebasis, schneller Feature-Durchsatz, breite Plattformabdeckung.
- ➕ Sicherheits- und Performance-kritische Pfade bleiben nativ — kein JS-Bridge im heißen Pfad.
- ➖ Höhere Komplexität an der JS↔Native-Grenze; klar definierte **Native-Module-API**
  (TurboModules, JSI) und Verträge nötig.
- ➖ Team braucht Swift- **und** Kotlin-Kompetenz, nicht nur RN.
- macOS via **React Native macOS** (Microsoft-Fork); Android nativ über RN-Standard.

### Alternativen
- *Native pro Plattform (Swift/SwiftUI + Kotlin/Compose):* sicherste/schnellste Option,
  aber abgelehnt wegen Aufwand/Time-to-Market bei 4 Plattformen.
- *Flutter:* eigene Rendering-Engine, aber schwächeres natives Krypto-/Exchange-Ökosystem.
- *Kotlin Multiplatform + native UI:* technisch elegant, aber höhere Anfangskomplexität;
  als möglicher späterer Migrationspfad für die Core-Logik notiert.

---

## ADR-002 — Exchange-Transport: EWS + EAS hybrid + Autodiscover

**Status:** ✅ Akzeptiert

### Kontext
Microsoft Exchange On-Premises bietet mehrere Protokolle. **EWS** (Exchange Web Services,
SOAP) ist am feature-reichsten (Kalender, Kontakte, Aufgaben, Delegation, Shared
Mailboxes, Public Folders, granulare Berechtigungen). **EAS** (ActiveSync, WBXML) ist
mobil-optimiert mit effizientem **Direct Push** und sparsamem Delta-Sync, aber
funktional begrenzter (z. B. keine Public Folders). EWS wird von Microsoft langfristig
zugunsten von Graph zurückgefahren — für **On-Prem** ist es jedoch weiterhin Standard.

### Entscheidung
**Hybrider Transport** über eine gemeinsame **Transport-Abstraktion** (`MailTransport`-Interface):

| Aufgabe | Bevorzugtes Protokoll |
|---------|-----------------------|
| Konto-Erkennung/Setup | **Autodiscover** (POX/SOAP) |
| Push / „neue Mail"-Signal | **EAS Direct Push** (Long-Polling, akkusparend) |
| Effizienter Mail-Delta-Sync | **EAS** (SyncKey-basiert) |
| Kalender, Kontakte, Aufgaben (reichhaltig) | **EWS** |
| Delegation, Shared Mailboxes, Public Folders | **EWS** |
| Suche serverseitig, Server-Regeln, Kategorien | **EWS** |
| Anhänge, MIME, S/MIME-Rohzugriff | **EWS** (`GetItem`/MIME) |

Autodiscover ermittelt Endpunkte/Fähigkeiten; die Transport-Schicht wählt pro Operation
das Protokoll und kapselt das vor den oberen Schichten.

### Konsequenzen
- ➕ Beste Kombination aus EAS-Effizienz (Push/Sync) und EWS-Funktionsbreite.
- ➕ Austauschbar: künftiger **Graph-Connector** kann als dritte Implementierung des
  `MailTransport`-Interfaces ergänzt werden (M365-Tauglichkeit ohne Rewrite).
- ➖ Zwei Protokoll-Parser (SOAP/XML + WBXML) zu pflegen.
- ➖ Konsistenz-/Mapping-Logik nötig (gleiches Item über zwei Protokolle).
- Risiko EWS-Deprecation: betrifft v. a. M365-Cloud; On-Prem-Roadmap von Microsoft beobachten.

### Alternativen
- *Nur EAS:* zu eingeschränkt für „Outlook-Ersatz" (keine Public Folders/Delegation-Tiefe).
- *Nur EWS:* funktional ausreichend, aber Push/Battery schlechter als EAS Direct Push.
- *Graph-only:* für reines On-Prem nicht tragfähig.

---

## ADR-003 — Offline-Datenhaltung & Sync-Modell

**Status:** ✅ Akzeptiert

### Kontext
NEXUS muss vollständig **offline-fähig** sein und sich „schneller als Outlook" anfühlen.
Das erfordert eine lokale, relationale, performante und verschlüsselte Datenbasis sowie
ein robustes Synchronisations- und Konfliktmodell.

### Entscheidung
- **Lokale DB:** **SQLite via SQLCipher** (AES-256, verschlüsselt at-rest). Zugriff aus
  RN über ein performantes natives Persistenz-Modul; kein ORM mit JS-Bridge im heißen Pfad.
- **Sync-Modell:** **Offline-First** mit lokalem Wahrheits-Cache. Lesen immer aus lokaler DB.
- **Outbox-Pattern:** Nutzeraktionen (Senden, Verschieben, Flaggen, Löschen) werden
  lokal sofort angewendet (optimistic UI) und in einer **Outbox** persistiert; ein
  Sync-Worker spielt sie idempotent gegen den Server.
- **Delta-Sync:** EAS-`SyncKey` bzw. EWS-`SyncFolderItems`/Watermark; nur Änderungen laden.
- **Konfliktstrategie:** Server-autoritativ für Item-Status; lokale Nutzeraktionen
  gewinnen für ausgehende Operationen. Konflikte werden protokolliert und (bei echten
  Kollisionen) als „Konfliktkopie" sichtbar gemacht statt still verworfen.

### Konsequenzen
- ➕ Sofortige UI, volle Offline-Nutzung, geringe wahrgenommene Latenz.
- ➕ Robust gegen Verbindungsabbrüche (idempotente, wiederholbare Outbox).
- ➖ Komplexere Sync-Engine; gründliche Tests für Idempotenz/Konflikte nötig.
- ➖ Speicherbedarf/Hygiene: konfigurierbare Sync-Fenster (z. B. „letzte 30 Tage Volltext,
  Rest on-demand") und Attachment-Caching mit Eviction.

### Alternativen
- *Realm/WatermelonDB:* gute RN-Integration, aber Verschlüsselung/Reife-Trade-offs;
  SQLCipher bevorzugt wegen Audit-Fähigkeit und Verbreitung.
- *Reines Server-Live (kein Offline):* widerspricht Kernanforderung — abgelehnt.

---

## ADR-004 — Suchindizierung

**Status:** ✅ Akzeptiert

### Kontext
Suche ist ein zentrales Outlook-Feature und ein USP-Hebel („schneller als Outlook").
Sie muss offline funktionieren und darf keine Daten an externe Dienste senden.

### Entscheidung
- **Lokaler Volltextindex** mit **SQLite FTS5** über Betreff, Absender/Empfänger, Body
  (plaintext-Extrakt) und Anhang-Metadaten.
- **Hybride Suche:** lokal-first (sofortige Ergebnisse), optional serverseitige Suche
  (EWS `FindItem`/AQS) für nicht lokal gecachte Bereiche, transparent zusammengeführt.
- Index wird **inkrementell** beim Sync aktualisiert; Body-Extraktion (HTML→Text) im
  nativen Worker, nicht im JS-Thread.

### Konsequenzen
- ➕ Sofortige, private, offline-fähige Suche.
- ➖ Indexgröße & Pflege; Reindex-Pfad bei Schemaänderungen nötig.

### Alternativen
- *Nur Serversuche:* offline unbrauchbar, langsamer — abgelehnt als Primärweg.

---

## ADR-005 — Verschlüsselung at-rest & Key-Management

**Status:** ✅ Akzeptiert

### Kontext
Alle lokalen Daten (Mails, Anhänge, Index, Tokens) müssen at-rest verschlüsselt sein und
gegen Geräteverlust/Diebstahl sowie unautorisierten App-Zugriff geschützt werden.

### Entscheidung
- **DB-Verschlüsselung:** SQLCipher (AES-256-CBC/HMAC).
- **Key-Hierarchie:** DB-Master-Key wird **nicht** in der App gespeichert, sondern aus
  einem im **Secure Enclave / StrongBox** geschützten Schlüssel abgeleitet und im
  **Keychain (iOS/macOS) bzw. Android Keystore** gehalten (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`).
- **Anhänge:** verschlüsselt im App-Sandbox-Container; kein Klartext im geteilten Cache.
- **Tokens/Credentials:** ausschließlich Keychain/Keystore, nie in JS-Speicher persistiert.
- **Biometrie-Gate (optional/Policy):** Face ID/Touch ID/BiometricPrompt vor Entsperrung.

### Konsequenzen
- ➕ Starker Schutz bei Geräteverlust; MDM-Remote-Wipe ergänzt (siehe Security-Konzept).
- ➖ Sorgfältiges Key-Lifecycle-Management (Rotation, Wipe, Migration) erforderlich.

---

## ADR-006 — Monorepo-Strategie

**Status:** ✅ Akzeptiert (Spezifikation; Umsetzung in Phase 10)

### Kontext
RN-App, native Module, geteilte TypeScript-Pakete (Protokoll-Typen, UI-Kit) und Tooling
sollen konsistent versioniert und gebaut werden.

### Entscheidung
- **Monorepo** mit **pnpm Workspaces** (+ ggf. Nx/Turborepo für Task-Caching).
- Grobe Struktur (Spezifikation, noch nicht angelegt):
  ```
  /apps/nexus-mobile        # RN-App (iOS/iPadOS/Android)
  /apps/nexus-desktop       # RN-macOS (teilt Code mit mobile)
  /packages/core-transport  # MailTransport-Abstraktion, EWS/EAS-Typen
  /packages/ui-kit          # Design-System-Komponenten (Phase 5)
  /packages/domain          # Domänenmodelle, ViewModels
  /native/ios               # Swift-Module
  /native/android           # Kotlin-Module
  /docs                     # dieses Verzeichnis
  ```
- **Coding-Standards:** TypeScript `strict`, ESLint + Prettier, Conventional Commits,
  Trunk-Based-Development mit kurzlebigen Feature-Branches.

### Konsequenzen
- ➕ Atomare Änderungen über App + Module + Typen hinweg; einheitliches Tooling.
- ➖ Build-Komplexität (RN + 2 native Toolchains + macOS) — CI-Matrix nötig (Phase 10).

---

## ADR-007 — Push ohne Cloud-Tracking

**Status:** ✅ Akzeptiert

### Kontext
Push ist nötig, darf aber „Privacy First" nicht verletzen (keine Inhalte über
Dritt-Clouds, keine Tracking-IDs).

### Entscheidung
- **iOS/macOS:** APNs nur als **Weck-Signal** (silent push) ODER **EAS Direct Push**
  (Long-Polling) wo Exchange direkt erreichbar ist; Mailinhalte werden **vom Gerät
  direkt** vom Exchange-Server geladen, nie über eine Vermittler-Cloud.
- **Android:** FCM nur als Weck-Signal; alternativ Direct-Push-Worker für FCM-freie/MDM-Umgebungen.
- **Kein** Push-Proxy von ITM, der Mailinhalte sieht. Bei APNs/FCM-Weck-Signal werden
  keine Inhalte im Payload transportiert.

### Konsequenzen
- ➕ Datenschutzkonform; Inhalte verlassen nie die Exchange↔Gerät-Strecke.
- ➖ Direct Push hält Verbindungen offen (Akku-Tuning nötig); APNs-Weck-Signal braucht
  korrektes Background-Fetch-Handling.
