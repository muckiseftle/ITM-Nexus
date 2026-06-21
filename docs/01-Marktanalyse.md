# Phase 1 — Marktanalyse

> Ziel: Stärken, Schwächen, Chancen und Risiken der relevanten Wettbewerber verstehen
> und daraus **Marktlücken** für NEXUS ableiten. Fokus-Linse: **Exchange On-Premises**,
> **Enterprise**, **Privacy/Security/Performance**.

---

## 1. Überblick & Bewertungsdimensionen

Wir bewerten jeden Wettbewerber entlang der für NEXUS strategisch relevanten Dimensionen:

- **Exchange-On-Prem:** Qualität der nativen On-Prem-Anbindung (EWS/EAS/Autodiscover).
- **Offline:** Vollständigkeit und Verlässlichkeit der Offline-Nutzung.
- **Security:** Verschlüsselung at-rest, Pinning, S/MIME, Härtung.
- **Privacy:** kein Tracking/Analytics; keine Inhalte über Dritt-Clouds.
- **Performance:** wahrgenommene Geschwindigkeit, Sync-Effizienz, Suche.
- **Enterprise/MDM:** Verwaltbarkeit, Policies, Remote-Wipe, Konfigurierbarkeit.

---

## 2. Vergleichsmatrix

Legende: ✅ stark · 🟧 teilweise/eingeschränkt · ❌ schwach/fehlt

| Produkt | Exchange On-Prem | Offline | Security | Privacy | Performance | Enterprise/MDM |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Outlook (M365 Mobile)** | 🟧¹ | 🟧 | ✅ | ❌² | 🟧 | ✅ |
| **Apple Mail** | 🟧³ | 🟧 | 🟧 | ✅ | ✅ | 🟧 |
| **Spark** | 🟧 | 🟧 | 🟧 | ❌⁴ | ✅ | 🟧 |
| **Canary Mail** | 🟧 | 🟧 | ✅ | ✅ | ✅ | 🟧 |
| **Edison Mail** | 🟧 | 🟧 | 🟧 | ❌⁵ | ✅ | ❌ |
| **Airmail** | 🟧 | 🟧 | 🟧 | 🟧 | 🟧 | ❌ |
| **Nine** | ✅ (EAS) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Aqua Mail** | 🟧 (EAS) | ✅ | 🟧 | 🟧 | ✅ | 🟧 |

> ¹ Outlook-Mobile leitet On-Prem-Konten historisch über einen **Microsoft-Cloud-Proxy**
> (Native-Connection später nachgerüstet) — datenschutzkritisch.
> ² Telemetrie/Analytics tief integriert. ³ EAS-basiert, EWS-Feature-Tiefe fehlt.
> ⁴ Cloud-Backend für „smart" Features. ⁵ Geschäftsmodell historisch datenbasiert.

---

## 3. SWOT je Wettbewerber

### 3.1 Microsoft Outlook (Mobile)
- **Stärken:** Marktführer, tiefe Exchange/M365-Integration, Kalender/Mail/Kontakte aus
  einer Hand, Enterprise-Verbreitung, Intune-MDM.
- **Schwächen:** On-Prem-Konten historisch über Cloud-Proxy; **Telemetrie/Tracking**;
  träge auf großen Postfächern; UI überladen; Offline begrenzt; nicht „unabhängig".
- **Chancen (für NEXUS):** Datenschutzbewusste On-Prem-Kunden, die Microsofts
  Cloud-Vermittlung ablehnen, sind unterversorgt.
- **Risiken (für NEXUS):** Microsofts Ökosystem-Lock-in, Bündelung, Vertriebsmacht.

### 3.2 Apple Mail
- **Stärken:** sehr schnell, systemintegriert, datensparsam, kostenlos, gute UX.
- **Schwächen:** nur **EAS**, keine EWS-Tiefe (Public Folders, Delegation, Shared
  Mailboxes schwach); kaum Enterprise-Verwaltung; nur Apple-Plattformen.
- **Chancen:** Enterprise-Funktionslücke (Delegation, Shared Mailboxes) offen.
- **Risiken:** „gut genug" für viele Basisnutzer; Apple kontrolliert die Plattform.

### 3.3 Spark (Readdle)
- **Stärken:** moderne UX, Smart Inbox, Team-Features, schnell.
- **Schwächen:** **Cloud-Backend** verarbeitet Mail-Metadaten (Privacy-Risiko für
  Enterprise/On-Prem); EWS-Tiefe begrenzt.
- **Chancen:** Nutzer, die die UX lieben, aber die Cloud ablehnen.
- **Risiken:** starke Produkt-/Designorganisation, schnelle Iteration.

### 3.4 Canary Mail
- **Stärken:** **Security/Privacy-Positionierung**, PGP/S/MIME, lokale KI-Ambitionen,
  gute UX.
- **Schwächen:** Exchange-On-Prem-Tiefe (EWS-Enterprise-Features) begrenzt; Enterprise-
  Management/MDM schwach; kleineres Team.
- **Chancen:** zeigt Zahlungsbereitschaft für Privacy — validiert NEXUS-Positionierung.
- **Risiken:** direkter Positionierungs-Wettbewerber im Privacy-Segment.

### 3.5 Edison Mail
- **Stärken:** schnelle UX, gute Suche, Reise-/Paket-Tracking-Features.
- **Schwächen:** Geschäftsmodell historisch **datenbasiert** (Mailbox-Insights-Verkauf);
  kein Enterprise/On-Prem-Fokus.
- **Chancen:** abschreckendes Negativbeispiel — stärkt NEXUS-Privacy-Narrativ.
- **Risiken:** gering im Enterprise-Segment.

### 3.6 Airmail
- **Stärken:** sehr anpassbar, viele Integrationen, Apple-Plattformen.
- **Schwächen:** Stabilitäts-/Qualitätsklagen, fragmentierte UX, schwacher Enterprise-/
  On-Prem-Fokus.
- **Chancen:** Nutzer, die Verlässlichkeit vermissen.
- **Risiken:** gering.

### 3.7 Nine (9Folders) — **der relevanteste Benchmark**
- **Stärken:** **EAS-fokussiert**, exzellente Offline-Fähigkeit, **datensparsam (kein
  Cloud-Backend)**, Direct Push, solide Security, gutes Enterprise-/Android-Standing.
- **Schwächen:** UX/Design altbacken; **EWS-Funktionsbreite fehlt** (Public Folders,
  reichhaltige Delegation); kein macOS; Marketing/Markenführung schwach.
- **Chancen:** Beweist Tragfähigkeit des „kein-Cloud-Backend, On-Prem"-Modells —
  **genau die Lücke, die NEXUS mit besserer UX + EWS-Tiefe + 4 Plattformen schließt.**
- **Risiken:** etablierter Platzhirsch im Privacy/On-Prem-Nischensegment.

### 3.8 Aqua Mail
- **Stärken:** Android-stark, anpassbar, EAS-Support, große Provider-Kompatibilität.
- **Schwächen:** UX uneinheitlich, Enterprise-Tiefe/EWS begrenzt, Apple-Plattformen schwach.
- **Chancen:** Android-Nutzer mit Enterprise-Bedarf.
- **Risiken:** gering im Enterprise/On-Prem-Segment.

---

## 4. Identifizierte Marktlücken

Aus der Analyse ergeben sich vier klare, kombinierbare Lücken — NEXUS adressiert **alle vier**:

1. **„Privacy-First **und** Enterprise-tief"**
   Kein Produkt verbindet *konsequente* Datensparsamkeit (kein Cloud-Backend, keine
   Telemetrie — wie Nine) mit *voller EWS-Enterprise-Funktionstiefe* (Delegation,
   Shared Mailboxes, Public Folders — wie Outlook). NEXUS schließt genau diese Mitte.

2. **„Moderne UX auf On-Prem"**
   Die privatsphäre-/On-Prem-tauglichen Produkte (Nine, Aqua) wirken veraltet; die schön
   gestalteten (Spark, Canary) machen Privacy-/Enterprise-Kompromisse. NEXUS bringt
   Apple-Niveau-UX in das On-Prem-Enterprise-Segment.

3. **„Wirklich plattformübergreifend für Enterprise"**
   Outlook deckt zwar viel ab; eine *unabhängige*, datensparsame Lösung über
   **iOS · iPadOS · macOS · Android** mit einheitlicher UX und Verwaltung fehlt.

4. **„Offline so gut wie nativ, Suche schneller als Outlook"**
   Verlässliche Offline-Nutzung + sofortige lokale Volltextsuche ist selten gut gelöst —
   ein konkreter, demonstrierbarer Performance-USP.

---

## 5. Schlussfolgerung für die Positionierung

> **NEXUS = die Enterprise-Funktionstiefe von Outlook, die Datensparsamkeit von Nine, die
> UX von Apple/Canary — über alle vier Plattformen, ohne Cloud-Abhängigkeit.**

Diese Positionierung fließt direkt in die [Produktstrategie](./02-Produktstrategie.md) und
das [Feature-Mapping](./07-Outlook-Ersatz-Feature-Mapping.md) ein.
