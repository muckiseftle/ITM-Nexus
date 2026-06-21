# Phase 7 — Outlook-Ersatz: Feature-Mapping & Bewertung

> Welche Outlook-Funktionen braucht NEXUS, um Outlook zu **ersetzen** (nicht zu kopieren)?
> Jede Funktion wird bewertet nach **Notwendigkeit**, **Aufwand**, **Protokoll-Verfügbarkeit
> (EWS/EAS)** und **Roadmap-Stufe**.

---

## 1. Bewertungslegende

- **Notwendigkeit:** 🔴 Kritisch · 🟠 Wichtig · 🟡 Nice-to-have
- **Aufwand:** S (klein) · M (mittel) · L (groß) · XL (sehr groß)
- **Protokoll:** bevorzugter Transport (siehe [ADR-002](./00-Architektur-Entscheidungen-ADR.md#adr-002--exchange-transport-ews--eas-hybrid--autodiscover))
- **Stufe:** MVP · V1 · V2 · ENT (Enterprise)

---

## 2. Master-Bewertungsmatrix

| Funktion | Notw. | Aufwand | Protokoll | Stufe | Anmerkung |
|----------|:---:|:---:|---|:---:|-----------|
| **Mail lesen/senden/antworten** | 🔴 | M | EAS+EWS | MVP | Kern; EAS-Sync + EWS-Detail |
| **Ordner & -verwaltung** | 🔴 | S | EAS/EWS | MVP | |
| **Verschieben/Löschen/Flag/Read** | 🔴 | S | EAS/EWS | MVP | über Outbox idempotent |
| **Offline-Zugriff** | 🔴 | L | lokal | MVP | Offline-First-DB |
| **Push/Benachrichtigung** | 🔴 | M | EAS Direct Push | MVP | akkuschonend |
| **Anhänge** | 🔴 | M | EWS/EAS | MVP | quarantänesicher |
| **Suche (lokal)** | 🟠 | M | lokal (FTS5) | MVP/V1 | USP „schneller als Outlook" |
| **Suche (serverseitig/AQS)** | 🟠 | M | EWS FindItem | V1 | für nicht gecachte Bereiche |
| **Kalender (anzeigen/erstellen/RSVP)** | 🔴 | L | EWS (EAS-Sync) | V1 | reichhaltig via EWS |
| **Kontakte / GAL-Suche** | 🔴 | M | EWS (GAL: EWS `ResolveNames`) | V1 | |
| **S/MIME signieren/verschlüsseln** | 🔴 | L | EWS (MIME) + nativ | V1 | Security-USP |
| **Signaturen** | 🟠 | S | lokal | V1 | |
| **Kategorien** | 🟠 | S | EWS | V1 | farbliche Kategorien |
| **Out-of-Office / Auto-Antwort** | 🟠 | S | EWS `OofSettings` | V1 | |
| **Mehrkonten** | 🟠 | M | beide | V1 | `accountId`-Partitionierung |
| **Geplantes Senden / Snooze** | 🟡 | M | lokal+Server | V1 | lokal geplant |
| **Delegation (Stellvertreter)** | 🔴 | L | EWS | V2 | „Senden im Auftrag" |
| **Shared Mailboxes** | 🔴 | L | EWS | V2 | Team-Postfächer |
| **Aufgaben (Tasks)** | 🟠 | M | EWS | V2 | |
| **Public Folders** | 🟠 | L | **EWS** | V2 | EAS kann das nicht |
| **Server-Regeln (Rules)** | 🟠 | M | EWS `Rules` | V2 | anzeigen/bearbeiten |
| **Notizen** | 🟡 | S | EWS | V2 | |
| **Archivierung (Online-Archiv)** | 🟡 | M | EWS | V2 | Archiv-Postfach |
| **Räume/Verfügbarkeit (Scheduling)** | 🟠 | M | EWS `GetUserAvailability` | V2 | Terminplanung |
| **MDM / AppConfig** | 🔴 | L | Plattform/MDM | ENT | Zero-Touch |
| **Policy-Engine / DLP** | 🔴 | L | Plattform/MDM | ENT | |
| **Remote-Wipe** | 🔴 | M | EAS + MDM | ENT | Krypto-Shredding |
| **Compliance / Aufbewahrung** | 🟠 | L | EWS + lokal | ENT | eDiscovery-tauglich |
| **Jailbreak/Root-Policy** | 🟠 | M | nativ | ENT | |

---

## 3. Bewertung nach Funktionsblöcken

### 3.1 Mail (🔴 kritisch)
Das Herzstück. EAS liefert effizienten Delta-Sync + Direct Push; EWS liefert
reichhaltige Item-Details, MIME (für S/MIME) und serverseitige Suche. **Beides nötig** —
Begründung in [ADR-002](./00-Architektur-Entscheidungen-ADR.md#adr-002--exchange-transport-ews--eas-hybrid--autodiscover).

### 3.2 Kalender / Kontakte (🔴 für vollwertigen Ersatz)
Ohne Kalender und Kontakte ist NEXUS kein Outlook-Ersatz, sondern nur ein Mail-Client.
EWS bietet die nötige Tiefe (Wiederholungen, RSVP, Verfügbarkeit, GAL). → **V1**.

### 3.3 Delegation & Shared Mailboxes (🔴 als Differenzierer)
**Genau hier** schlägt NEXUS Apple Mail und Nine. EWS unterstützt Stellvertreterzugriff
und „Senden im Auftrag" sauber. Hoher Aufwand, hoher strategischer Wert. → **V2**.

### 3.4 Public Folders (🟠, nur EWS)
EAS kann Public Folders **nicht** — ein konkreter Grund für den EWS-Teil des Hybrids.
Wichtig für bestimmte Enterprise-Kunden. → **V2**.

### 3.5 S/MIME (🔴 für Security-Segment)
Differenzierungsmerkmal im sicherheitskritischen Segment. Benötigt EWS-MIME-Zugriff +
native Krypto. → **V1**.

### 3.6 Enterprise-Management (🔴 für Flottenbetrieb)
MDM/AppConfig, Policy-Engine, Remote-Wipe, Compliance — der Eintritt in den
verwalteten Großkundenbetrieb. → **Enterprise Edition**.

---

## 4. Bewusste Auslassungen (Outlook-Features, die NEXUS *nicht* nachbaut)

| Outlook-Feature | Entscheidung | Begründung |
|-----------------|--------------|------------|
| Tiefe M365-Cloud-Integration (Teams/OneDrive-Verzahnung) | ❌ | widerspricht „unabhängig/On-Prem"; ggf. später optional |
| Werbung / „Fokussierter Posteingang" mit Cloud-ML | ❌ | Privacy First; nur lokale Heuristik erlaubt |
| Add-In-Marktplatz (Cloud-Add-Ins) | ⏳ später | Sicherheits-/Komplexitäts-Risiko |
| Telemetrie/Insights („MyAnalytics") | ❌ | explizit ausgeschlossen |

---

## 5. Fazit

NEXUS erreicht **funktionale Outlook-Parität für Einzelnutzer in V1** (Mail, Kalender,
Kontakte, S/MIME, Suche) und **übertrifft mobile Wettbewerber in V2** (Delegation, Shared
Mailboxes, Public Folders) — bei konsequenter Datensparsamkeit. Die Enterprise Edition
schließt die Lücke zum verwalteten Flottenbetrieb.

> Umsetzung dieser Funktionen als Epics/Tasks: siehe [Phase 8](./08-Entwicklungsplan.md).
