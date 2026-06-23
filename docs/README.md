# NEXUS — Dokumentations-Fundament

> **NEXUS** von **ITM Technologies** — eine moderne, schnelle, sichere und
> unabhängige Kommunikationsplattform für Microsoft Exchange On-Premises.
>
> **NEXUS ist ein eigenständiges Produkt — ohne Cloud-Zwang und ohne Telemetrie.**

---

## Status

| | |
|---|---|
| **Phase** | 1–9 abgeschlossen (Strategie & Architektur) |
| **Implementierung** | Phase 10 — Iteration 1 umgesetzt (Monorepo + getesteter TS-Core) |
| **Tech-Stack** | React Native CLI + Native-Core (Swift/Kotlin) |
| **Plattformen** | iOS · iPadOS · macOS · Android |
| **Exchange-Transport** | EWS + EAS (ActiveSync) hybrid, mit Autodiscover |
| **Stand** | 2026-06 |

---

## Leitprinzipien

NEXUS **muss**: schnell, einfach, modern und sicher sein.

NEXUS **darf nicht**: von Cloud-Diensten abhängig sein, Tracking, Analytics, Werbung
oder unnötige Telemetrie enthalten.

> **Privacy First. Security First. Performance First.**

---

## Die Kern-Entscheidung: „Thin-JS / Native-Core"

React Native liefert eine Codebasis für vier Plattformen — erfüllt aber den Anspruch
an Sicherheit und Performance **nicht** out-of-the-box. Deshalb gilt für NEXUS ein
striktes Architekturprinzip:

> **UI, Navigation und Orchestrierung** laufen in React Native / TypeScript.
> **Alle security- und performance-kritischen Pfade** sind **native Module**
> (Swift/Kotlin): Keychain/Keystore, Krypto & lokale Verschlüsselung (SQLCipher),
> S/MIME, Certificate Pinning, Background-Sync, Push, MDM-Integration und die
> Exchange-Protokoll-Engine (EWS/EAS).

Begründung und Trade-offs: siehe [ADR-001](./00-Architektur-Entscheidungen-ADR.md).

---

## Navigation

| # | Dokument | Inhalt |
|---|----------|--------|
| 00 | [Architektur-Entscheidungen (ADR)](./00-Architektur-Entscheidungen-ADR.md) | Verbindliche Architektur-Entscheidungen mit Begründung |
| 01 | [Zielbild & Anforderungen](./01-Marktanalyse.md) | Anforderungsprofil, NEXUS-Stärken & Prinzipien, Positionierung |
| 02 | [Produktstrategie](./02-Produktstrategie.md) | Zielgruppen, Personas, USPs, Produktvision |
| 03 | [Architektur](./03-Architektur.md) | Systemarchitektur, Module, Datenflüsse (Diagramme) |
| 04 | [Security-Konzept](./04-Security-Konzept.md) | Threat-Model, Risiken & Gegenmaßnahmen |
| 05 | [UX & Design](./05-UX-und-Design.md) | Designprinzipien, Design System, Flows, Accessibility |
| 06 | [Feature-Roadmap](./06-Feature-Roadmap.md) | MVP / V1 / V2 / Enterprise Edition |
| 07 | [Feature-Katalog](./07-Feature-Katalog.md) | NEXUS-Funktionen mit Status und Protokollbezug |
| 08 | [Entwicklungsplan](./08-Entwicklungsplan.md) | Epics, Tasks, Milestones, Sprints |
| 09 | [Risikoanalyse](./09-Risikoanalyse.md) | Technische & strategische Risiken + Mitigation |
| 10 | [Implementierung](./10-Implementierung.md) | Repo-Struktur, Standards, Architekturregeln, CI/CD, Teststrategie |
| 11 | [Native-Schicht & App](./11-Native-und-App.md) | Native Module (Swift/Kotlin), RN-App, Bridge, Status |

---

## Wie diese Dokumente zu lesen sind

1. **Entscheider / Investoren:** Diese Seite → [Produktstrategie](./02-Produktstrategie.md)
   → [Feature-Roadmap](./06-Feature-Roadmap.md).
2. **Architekten / Engineering:** [ADR](./00-Architektur-Entscheidungen-ADR.md)
   → [Architektur](./03-Architektur.md) → [Security](./04-Security-Konzept.md)
   → [Entwicklungsplan](./08-Entwicklungsplan.md).
3. **Design / Produkt:** [Zielbild & Anforderungen](./01-Marktanalyse.md)
   → [UX & Design](./05-UX-und-Design.md)
   → [Feature-Katalog](./07-Feature-Katalog.md).

> Diagramme sind in **Mermaid** notiert und rendern auf GitHub sowie in den meisten
> Markdown-Vorschauen automatisch.
