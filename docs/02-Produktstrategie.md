# Phase 2 — Produktstrategie

> Aufbauend auf den Anforderungen aus [Phase 1](./01-Marktanalyse.md): Wer ist die
> Zielgruppe, welche Personas, welche USPs, und wohin entwickelt sich NEXUS langfristig?

---

## 1. Strategische Positionierung (Nordstern)

> **NEXUS ist der unabhängige, datensouveräne Exchange-On-Premises-Client für
> Organisationen, die volle Funktionstiefe für geschäftskritische Kommunikation
> benötigen, ohne Cloud-Zwang und ohne Telemetrie — auf allen vier Plattformen, mit
> erstklassiger, durchgängiger UX.**

**One-Liner (Vertrieb):** „Volle Exchange-Funktionalität. Ohne Cloud-Zwang. Ohne
Tracking. Auf jedem Gerät."

NEXUS definiert sich über die eigene Vision: **Privacy First, Security First,
Performance First.** Daten verbleiben in der eigenen Infrastruktur, der Client
kommuniziert direkt mit dem On-Premises-Server, und die Anwendung erhebt keine
Telemetrie.

---

## 2. Zielgruppen (Segmente)

| Segment | Beschreibung | Warum NEXUS |
|---------|--------------|-------------|
| **Regulierte Branchen** | Behörden, Gesundheitswesen, Recht, Finanzen, Verteidigung | Datensouveränität, On-Premises-Pflicht, keine Cloud-Vermittlung, Compliance |
| **Datenschutzbewusster Mittelstand (DACH)** | Unternehmen mit eigener Exchange-Infrastruktur | DSGVO, Datenhaltung im eigenen Haus, volle Kontrolle |
| **IT-Abteilungen / MSPs** | Verwalten Mail für viele Nutzer | MDM, Policies, Remote-Wipe, einheitliche Verwaltung |
| **Power-User / Knowledge-Worker** | Hohe Mailvolumina, Delegation, Shared Mailboxes | Geschwindigkeit, Offline, Suche, Enterprise-Features |
| **Sicherheitskritische Einzelnutzer** | Anwälte, Journalisten, Vorstände | S/MIME, lokale Verschlüsselung, kein Tracking |

**Primärsegment für Markteintritt:** Datenschutzbewusster DACH-Mittelstand & regulierte
Branchen mit bestehender Exchange-On-Premises-Infrastruktur (passt zu ITM Technologies'
Heimatmarkt und Vertrieb).

---

## 3. Personas

### Persona A — „Dr. Petra Hofmann", IT-Sicherheitsverantwortliche (Buyer/Admin)
- **Kontext:** CISO/IT-Leitung in einem 800-Personen-Klinikverbund, Exchange 2019 On-Premises.
- **Ziele:** Compliance (DSGVO, Patientendaten), Remote-Wipe, keine Daten in fremden Clouds.
- **Frust mit Status quo:** Cloud-Vermittlung mobiler Clients, intransparente Telemetrie,
  Audit-Aufwand.
- **NEXUS-Wert:** MDM/AppConfig, Policies, Certificate Pinning, lokale Verschlüsselung,
  nachweisbare Datensparsamkeit.

### Persona B — „Markus Brandt", Vertriebsleiter (Power-User)
- **Kontext:** 200+ Mails/Tag, mehrere Shared Mailboxes, Delegation für 2 Assistenzen,
  viel unterwegs (schlechtes Netz).
- **Ziele:** schnell durch die Inbox, offline im Zug arbeiten, sofort finden.
- **Frust:** mobile Clients langsam bei großen Postfächern, Offline unzuverlässig, Suche träge.
- **NEXUS-Wert:** Offline-First, sofortige lokale Suche, schnelle UI, Delegation/Shared
  Mailboxes nativ.

### Persona C — „Sandra Keil", Assistenz der Geschäftsführung (Delegate)
- **Kontext:** verwaltet Kalender und Postfach von zwei Vorständen.
- **Ziele:** stellvertretend Termine/Mails verwalten, klare Trennung der Identitäten.
- **Frust:** Delegation auf Mobile häufig schwach umgesetzt, Senden „im Auftrag" umständlich.
- **NEXUS-Wert:** erstklassige Delegations-UX, klare Mailbox-Umschaltung, „Senden im Auftrag".

### Persona D — „Jonas Weber", IT-Administrator / MSP (Operator)
- **Kontext:** betreut Exchange-Mail für 30 KMU-Kunden.
- **Ziele:** schnelles Onboarding (Autodiscover), zentrale Policy-Verteilung, wenig Support.
- **Frust:** heterogene Mail-Apps, manuelle Konfiguration, kein einheitliches Management.
- **NEXUS-Wert:** Autodiscover-Zero-Touch, AppConfig/MDM, einheitliche Plattform.

### Persona E — „Dr. Lena Vogt", Rechtsanwältin (Security-Einzelnutzerin)
- **Kontext:** mandatsbezogene, vertrauliche Kommunikation, S/MIME-Pflicht.
- **Ziele:** signierte/verschlüsselte Mail, absolute Vertraulichkeit, auch auf iPad.
- **NEXUS-Wert:** natives S/MIME, lokale Verschlüsselung, Biometrie-Gate, iPad-optimiert.

---

## 4. Zentrale Use Cases

1. **Zero-Touch-Onboarding:** E-Mail + Passwort → Autodiscover → fertig konfiguriert.
2. **Offline-Triage:** im Flugzeug Mails lesen, beantworten, sortieren → Sync bei Netz.
3. **Sofortsuche:** „Vertrag Müller Q3" → Ergebnisse in <200 ms aus lokalem Index.
4. **Delegation:** Assistenz öffnet Vorstands-Postfach, sendet „im Auftrag".
5. **Shared Mailbox:** Team bearbeitet `info@`-Postfach gemeinsam mit Statusklarheit.
6. **Sichere Kommunikation:** S/MIME-signierte/verschlüsselte Mail in zwei Taps.
7. **Geräteverlust:** Admin löst Remote-Wipe aus → lokale Daten unwiederbringlich gelöscht.
8. **Plattformwechsel:** dieselbe Erfahrung auf iPhone, iPad, Mac und Android.

---

## 5. Unique Selling Points (USPs)

| # | USP | Beleg/Mechanik | Anspruch |
|---|-----|----------------|----------|
| 1 | **Keine Cloud-Vermittlung** | Gerät spricht direkt mit Exchange (EWS/EAS) | Daten verlassen die eigene Infrastruktur nicht |
| 2 | **Null Telemetrie/Tracking** | Privacy-by-Design, auditierbar | keine Datenerhebung, nachweisbar |
| 3 | **Enterprise-Tiefe** | Delegation, Shared Mailboxes, Public Folders via EWS | vollständige Funktionstiefe für Organisationen |
| 4 | **Offline „wie nativ"** | Offline-First-DB + Outbox | voller Funktionsumfang ohne Netz |
| 5 | **Sofortsuche** | lokaler FTS5-Index | Ergebnisse in <200 ms, vollständig lokal |
| 6 | **Vier Plattformen, eine Erfahrung** | iOS·iPadOS·macOS·Android | durchgängige UX über alle Geräte |
| 7 | **Security-Härtung** | SQLCipher, Pinning, S/MIME, MDM, Remote-Wipe | Enterprise-grade |
| 8 | **Datensouveränität** | alles On-Premises, DSGVO-konform | DACH-/Regulatorik-Hebel |

---

## 6. Differenzierung & technischer Anspruch (Moat)

- **Native-Core-Engineering-Tiefe** (EWS/EAS-Hybrid, Krypto) ist anspruchsvoll umzusetzen
  und bildet eine technische Eintrittsbarriere.
- **Vertrauens-/Compliance-Marke** im DACH-/Regulatorik-Segment (ITM Technologies).
- **Plattformbreite und UX-Qualität gleichzeitig** — beides auf hohem Niveau in einem Produkt.
- **Klare, glaubwürdige Privacy-Story** ohne Geschäftsmodell-Interessenkonflikt
  (Lizenz-/Abo-Modell statt Datenverwertung).

---

## 7. Geschäftsmodell (Skizze, zur Validierung)

- **Per-Seat-Lizenz / Abo** (B2B), gestaffelt: *Standard* und *Enterprise Edition*
  (MDM, erweiterte Policies, Public Folders, Compliance-Features).
- **Keine** Datenmonetarisierung — explizit Teil des Markenversprechens.
- Optionale **On-Premises-/Self-Hosted-Management-Komponente** für Großkunden (später).

---

## 8. Langfristige Produktvision

1. **Jahr 1:** Erstklassiger datensouveräner Exchange-On-Premises-Client (Mail-Fokus, MVP→V1).
2. **Jahr 2:** Vollständige Funktionstiefe (Kalender, Kontakte, Aufgaben, Delegation,
   Public Folders, S/MIME) auf allen vier Plattformen; Enterprise Edition.
3. **Jahr 3+:** Plattform-Erweiterung — optionaler Graph-Connector (M365-Hybrid), lokale
   (on-device) Intelligenz für Triage/Suche **ohne** Cloud, Workflow-/Team-Features.

> Strategische Leitplanke: **Jede** neue Fähigkeit muss „Privacy/Security/Performance
> First" wahren. Features, die nur über eine Vermittler-Cloud gehen, werden abgelehnt.
