# NEXUS

**Der unabhängige, datensouveräne Exchange-Client.**
Von **ITM Technologies**.

> Outlook-Funktionalität. Ohne Microsoft-Cloud. Ohne Tracking. Auf jedem Gerät.

NEXUS ist die modernste, schnellste, sicherste und unabhängigste Kommunikationsplattform
für **Microsoft Exchange On-Premises** und Enterprise-Kunden.
**NEXUS kopiert Outlook nicht — NEXUS ersetzt Outlook.**

---

## Leitprinzipien

> **Privacy First · Security First · Performance First**

NEXUS muss schneller, einfacher, moderner und sicherer als Outlook sein — ohne
Cloud-Abhängigkeit, ohne Tracking, ohne Analytics, ohne Werbung, ohne unnötige Telemetrie.

## Eckdaten

| | |
|---|---|
| **Tech-Stack** | React Native CLI + Native-Core (Swift/Kotlin) |
| **Plattformen** | iOS · iPadOS · macOS · Android |
| **Exchange** | EWS + EAS (ActiveSync) hybrid, mit Autodiscover |
| **Status** | Phasen 1–9 abgeschlossen · Phase 10 Iteration 1 (Monorepo + getesteter TS-Core) umgesetzt |

---

## 📚 Dokumentation

Das vollständige Strategie- und Architektur-Fundament liegt in **[`/docs`](./docs/README.md)**:

1. [Architektur-Entscheidungen (ADR)](./docs/00-Architektur-Entscheidungen-ADR.md)
2. [Marktanalyse](./docs/01-Marktanalyse.md)
3. [Produktstrategie](./docs/02-Produktstrategie.md)
4. [Architektur](./docs/03-Architektur.md)
5. [Security-Konzept](./docs/04-Security-Konzept.md)
6. [UX & Design](./docs/05-UX-und-Design.md)
7. [Feature-Roadmap](./docs/06-Feature-Roadmap.md)
8. [Outlook-Ersatz-Feature-Mapping](./docs/07-Outlook-Ersatz-Feature-Mapping.md)
9. [Entwicklungsplan](./docs/08-Entwicklungsplan.md)
10. [Risikoanalyse](./docs/09-Risikoanalyse.md)
11. [Implementierung](./docs/10-Implementierung.md)

## 🛠️ Entwicklung

Das Monorepo (pnpm Workspaces) enthält die plattformunabhängigen TypeScript-Pakete
`@nexus/domain`, `@nexus/core-transport` und `@nexus/ui-kit`. Native Module (Swift/Kotlin)
und die React-Native-Apps folgen in den nächsten Iterationen
(siehe [docs/10](./docs/10-Implementierung.md) und [CONTRIBUTING.md](./CONTRIBUTING.md)).

```bash
pnpm install
pnpm verify   # typecheck + lint + test (mit Coverage)
```
