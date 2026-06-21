# Phase 2 — Produktstrategie

> Aufbauend auf den Marktlücken aus [Phase 1](./01-Marktanalyse.md): Wer ist die
> Zielgruppe, welche Personas, welche USPs, und wohin entwickelt sich NEXUS langfristig?

---

## 1. Strategische Positionierung (Nordstern)

> **NEXUS ist der unabhängige, datensouveräne Exchange-Client für Organisationen, die die
> Funktionstiefe von Outlook brauchen, aber die Cloud-Abhängigkeit und Telemetrie von
> Microsoft ablehnen — auf allen vier Plattformen, mit Apple-Niveau-UX.**

**One-Liner (Vertrieb):** „Outlook-Funktionalität. Ohne Microsoft-Cloud. Ohne Tracking.
Auf jedem Gerät."

---

## 2. Zielgruppen (Segmente)

| Segment | Beschreibung | Warum NEXUS |
|---------|--------------|-------------|
| **Regulierte Branchen** | Behörden, Gesundheitswesen, Recht, Finanzen, Verteidigung | Datensouveränität, On-Prem-Pflicht, kein Cloud-Proxy, Compliance |
| **Datenschutzbewusster Mittelstand (DACH)** | Unternehmen mit eigener Exchange-Infrastruktur | DSGVO, „kein US-Cloud", volle Kontrolle |
| **IT-Abteilungen / MSPs** | Verwalten Mail für viele Nutzer | MDM, Policies, Remote-Wipe, einheitliche Verwaltung |
| **Power-User / Knowledge-Worker** | Hohe Mailvolumina, Delegation, Shared Mailboxes | Geschwindigkeit, Offline, Suche, Enterprise-Features |
| **Sicherheitskritische Einzelnutzer** | Anwälte, Journalisten, Vorstände | S/MIME, lokale Verschlüsselung, kein Tracking |

**Primärsegment für Markteintritt:** Datenschutzbewusster DACH-Mittelstand & regulierte
Branchen mit bestehender Exchange-On-Prem-Infrastruktur (passt zu ITM Technologies'
Heimatmarkt und Vertrieb).

---

## 3. Personas

### Persona A — „Dr. Petra Hofmann", IT-Sicherheitsverantwortliche (Buyer/Admin)
- **Kontext:** CISO/IT-Leitung in einem 800-Personen-Klinikverbund, Exchange 2019 On-Prem.
- **Ziele:** Compliance (DSGVO, Patientendaten), Remote-Wipe, keine Daten in fremden Clouds.
- **Frust mit Status quo:** Outlook-Mobile-Cloud-Vermittlung, intransparente Telemetrie,
  Audit-Aufwand.
- **NEXUS-Wert:** MDM/AppConfig, Policies, Certificate Pinning, lokale Verschlüsselung,
  nachweisbare Datensparsamkeit.

### Persona B — „Markus Brandt", Vertriebsleiter (Power-User)
- **Kontext:** 200+ Mails/Tag, mehrere Shared Mailboxes, Delegation für 2 Assistenzen,
  viel unterwegs (schlechtes Netz).
- **Ziele:** schnell durch die Inbox, offline im Zug arbeiten, sofort finden.
- **Frust:** Outlook langsam bei großen Postfächern, Offline unzuverlässig, Suche träge.
- **NEXUS-Wert:** Offline-First, sofortige lokale Suche, schnelle UI, Delegation/Shared
  Mailboxes nativ.

### Persona C — „Sandra Keil", Assistenz der Geschäftsführung (Delegate)
- **Kontext:** verwaltet Kalender und Postfach von zwei Vorständen.
- **Ziele:** stellvertretend Termine/Mails verwalten, klare Trennung der Identitäten.
- **Frust:** Delegation auf Mobile schlecht gelöst, Senden „im Auftrag" umständlich.
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

| # | USP | Beleg/Mechanik | Abgrenzung |
|---|-----|----------------|------------|
| 1 | **Keine Cloud-Vermittlung** | Gerät spricht direkt mit Exchange (EWS/EAS) | vs. Outlook-Cloud-Proxy |
| 2 | **Null Telemetrie/Tracking** | Privacy-by-Design, auditierbar | vs. Outlook, Spark, Edison |
| 3 | **Enterprise-Tiefe** | Delegation, Shared Mailboxes, Public Folders via EWS | vs. Nine, Apple Mail |
| 4 | **Offline „wie nativ"** | Offline-First-DB + Outbox | vs. den meisten Webmail-artigen Clients |
| 5 | **Sofortsuche** | lokaler FTS5-Index | „schneller als Outlook" |
| 6 | **Vier Plattformen, eine Erfahrung** | iOS·iPadOS·macOS·Android | vs. Apple Mail, Nine |
| 7 | **Security-Härtung** | SQLCipher, Pinning, S/MIME, MDM, Remote-Wipe | Enterprise-grade |
| 8 | **Datensouveränität** | alles On-Prem, DSGVO-konform | DACH-/Regulatorik-Hebel |

---

## 6. Wettbewerbsvorteile (Moat)

- **Native-Core-Engineering-Tiefe** (EWS/EAS-Hybrid, Krypto) ist schwer zu kopieren und
  bildet eine technische Eintrittsbarriere.
- **Vertrauens-/Compliance-Marke** im DACH-/Regulatorik-Segment (ITM Technologies).
- **Plattformbreite + UX-Qualität** gleichzeitig — die meisten Wettbewerber haben nur eines.
- **Klare, glaubwürdige Privacy-Story** ohne Geschäftsmodell-Interessenkonflikt
  (Lizenz-/Abo-Modell statt Datenverwertung).

---

## 7. Geschäftsmodell (Skizze, zur Validierung)

- **Per-Seat-Lizenz / Abo** (B2B), gestaffelt: *Standard* vs. *Enterprise Edition*
  (MDM, erweiterte Policies, Public Folders, Compliance-Features).
- **Keine** Datenmonetarisierung — explizit Teil des Markenversprechens.
- Optionale **On-Prem-/Self-Hosted-Management-Komponente** für Großkunden (später).

---

## 8. Langfristige Produktvision

1. **Jahr 1:** Bester datensouveräner Exchange-On-Prem-Client (Mail-Fokus, MVP→V1).
2. **Jahr 2:** Vollständiger Outlook-Ersatz (Kalender, Kontakte, Aufgaben, Delegation,
   Public Folders, S/MIME) auf allen vier Plattformen; Enterprise Edition.
3. **Jahr 3+:** Plattform-Erweiterung — optionaler Graph-Connector (M365-Hybrid), lokale
   (on-device) Intelligenz für Triage/Suche **ohne** Cloud, Workflow-/Team-Features.

> Strategische Leitplanke: **Jede** neue Fähigkeit muss „Privacy/Security/Performance
> First" wahren. Features, die nur über eine Vermittler-Cloud gehen, werden abgelehnt.
