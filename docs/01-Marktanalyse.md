# Zielbild & Anforderungen

> Ziel: Das angestrebte Produktbild von NEXUS klar definieren und die zentralen
> Anforderungen ableiten. Fokus-Linse: **Exchange On-Premises**, **Enterprise**,
> **Privacy/Security/Performance**.

---

## 1. Bewertungsdimensionen

NEXUS wird entlang der folgenden, strategisch relevanten Dimensionen entwickelt und
gemessen. Sie bilden den verbindlichen Qualitätsanspruch des Produkts:

- **Exchange-On-Prem:** native, vollwertige On-Prem-Anbindung über EWS/EAS/Autodiscover —
  ohne Vermittlung durch Dritt-Clouds.
- **Offline:** vollständige und verlässliche Offline-Nutzung von Mail, Kalender und Kontakten.
- **Security:** Verschlüsselung at-rest, Certificate-Pinning, S/MIME, durchgehende Härtung.
- **Privacy:** kein Tracking/Analytics; keine Inhalte oder Metadaten über fremde Clouds.
- **Performance:** hohe wahrgenommene Geschwindigkeit, effizienter Sync, sofortige Suche.
- **Enterprise/MDM:** Verwaltbarkeit, Policies, Remote-Wipe, breite Konfigurierbarkeit.

---

## 2. Anforderungsprofil von NEXUS

Die folgende Übersicht beschreibt das Zielniveau, das NEXUS in jeder Dimension erreicht.
Legende: ✅ Kernanspruch · 🟧 differenziert je Plattform/Phase

| Dimension | Zielniveau | Anspruch |
|-----------|:---:|---|
| **Exchange On-Prem** | ✅ | Direkte native Anbindung (EWS-Tiefe + EAS), Autodiscover, ohne Cloud-Proxy. |
| **Offline** | ✅ | Lesen, Suchen, Verfassen und Verwalten vollständig offline; verlässliche Re-Sync-Logik. |
| **Security** | ✅ | Verschlüsselung at-rest (SQLCipher), Certificate-Pinning, S/MIME, Plattform-Härtung. |
| **Privacy** | ✅ | Kein Telemetrie-/Tracking-Backend; Inhalte und Metadaten verlassen das Gerät nur Richtung Exchange. |
| **Performance** | ✅ | Schnelle UI, effizienter DirectPush-Sync, sofortige lokale Volltextsuche. |
| **Enterprise/MDM** | ✅ | Policies, Remote-Wipe, konfigurierbare Richtlinien, einheitliche Verwaltung. |

---

## 3. NEXUS-Stärken & Prinzipien

NEXUS folgt einem klaren Satz von Prinzipien, die das Produkt in jeder Dimension prägen.

### 3.1 Datensparsamkeit als Fundament
- NEXUS betreibt **kein Cloud-Backend** für Inhalte oder Metadaten. Daten fließen
  ausschließlich zwischen Gerät und dem hauseigenen Exchange-Server.
- Es gibt **keine Telemetrie und kein Tracking**. Privacy ist kein Modus, sondern Grundzustand.

### 3.2 Tiefe Exchange-On-Prem-Integration
- Native Anbindung über **EWS** und **EAS/ActiveSync** mit **Autodiscover**, ohne
  Vermittlung durch einen Dritt-Proxy.
- Volle Enterprise-Funktionstiefe als Ziel: **Delegation**, **Shared Mailboxes**,
  **Public Folders** — Funktionen, die in datensparsamen Lösungen häufig fehlen.

### 3.3 Verlässliche Offline-Nutzung
- Mail, Kalender und Kontakte sind offline vollständig nutzbar.
- Eine robuste Sync- und Konfliktlogik sorgt für saubere Synchronisation, sobald wieder
  Verbindung besteht. **DirectPush** hält Postfächer aktuell.

### 3.4 Security by Design
- Verschlüsselung at-rest (**SQLCipher**), **Certificate-Pinning**, **S/MIME**.
- Schlüssel werden in der plattformeigenen sicheren Ablage gehalten (**Keychain** auf
  iOS/iPadOS/macOS, **Keystore** auf Android).
- Unterstützung gängiger Authentifizierungsverfahren: **NTLM/Kerberos/Basic**.

### 3.5 Moderne, schnelle UX
- Hochwertige, konsistente Bedienoberfläche mit hoher wahrgenommener Geschwindigkeit.
- **Sofortige lokale Volltextsuche** über große Postfächer als demonstrierbarer
  Performance-Vorteil.

### 3.6 Wirklich plattformübergreifend
- Einheitliche Funktion und Verwaltung über **iOS · iPadOS · macOS · Android**.
- Eine konsistente Erfahrung auf allen vier Plattformen, mit derselben Sicherheits- und
  Privacy-Garantie.

### 3.7 Enterprise-Verwaltbarkeit
- Konfigurierbare **Policies**, **Remote-Wipe** und MDM-Anbindung.
- Geeignet für den verwalteten Einsatz in Organisationen mit On-Prem-Infrastruktur.

---

## 4. Adressierte Bedarfsfelder

NEXUS adressiert vier zentrale Bedarfsfelder, die zusammen das Zielbild bilden:

1. **Privacy-First und Enterprise-tief zugleich**
   NEXUS verbindet *konsequente* Datensparsamkeit (kein Cloud-Backend, keine Telemetrie)
   mit *voller EWS-Enterprise-Funktionstiefe* (Delegation, Shared Mailboxes, Public
   Folders). Diese Kombination ist der Kern des Produkts.

2. **Moderne UX auf On-Prem**
   Eine hochwertige, zeitgemäße Bedienoberfläche im On-Prem-Enterprise-Segment — ohne
   Kompromisse bei Privacy oder Enterprise-Funktionalität.

3. **Wirklich plattformübergreifend für Enterprise**
   Eine unabhängige, datensparsame Lösung über **iOS · iPadOS · macOS · Android** mit
   einheitlicher UX und Verwaltung.

4. **Offline so gut wie nativ, mit schneller Suche**
   Verlässliche Offline-Nutzung kombiniert mit sofortiger lokaler Volltextsuche — ein
   konkreter, demonstrierbarer Performance-Vorteil.

---

## 5. Positionierung

> **NEXUS = volle Enterprise-Funktionstiefe, konsequente Datensparsamkeit und hochwertige
> UX — über alle vier Plattformen, ohne Cloud-Abhängigkeit.**

Diese Positionierung fließt direkt in die [Produktstrategie](./02-Produktstrategie.md) und
das [Feature-Mapping](./07-Feature-Katalog.md) ein.
