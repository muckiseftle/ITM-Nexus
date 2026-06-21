# Phase 9 — Risikoanalyse

> Identifikation der wesentlichen Risiken über alle Dimensionen — **technisch, Exchange,
> Architektur, iOS/RN, Skalierung** — mit Bewertung (Wahrscheinlichkeit × Auswirkung) und
> **konkreten Lösungen/Mitigationen**. Security-spezifische Risiken sind im
> [Security-Konzept](./04-Security-Konzept.md) detailliert; hier der projektweite Blick.

---

## 1. Bewertungsschema

- **Wahrscheinlichkeit (W):** Niedrig · Mittel · Hoch
- **Auswirkung (A):** Niedrig · Mittel · Hoch · Kritisch
- **Risikostufe:** Kombination aus W × A (🟢 niedrig · 🟡 mittel · 🟠 hoch · 🔴 kritisch)

---

## 2. Risiko-Heatmap (Kategorien)

Einordnung der wichtigsten Risiken nach Wahrscheinlichkeit (W) × Auswirkung (A).
Spalten = Auswirkung, Zeilen = Wahrscheinlichkeit.

| W ↓ \ A → | **Mittel** | **Hoch** | **Kritisch** |
|-----------|------------|----------|--------------|
| **Hoch**  | EWS/EAS-Mapping-Drift (X2) | Autodiscover-Vielfalt (X1) · Native-Engpass (S3) | — |
| **Mittel**| Akku/Direct-Push (P2) · Throttling (X6) | Bridge-Performance (T1) · Auth-Heterogenität (X3) · große Postfächer (S1) | — |
| **Niedrig**| EWS-Deprecation (X4) | App-Store-Richtlinien (P3) | Krypto-Fehler (T2) |

> 🟠 hoch = obere/rechte Zellen → aktiv steuern · 🔴 = Krypto-Fehler (geringe W,
> kritische A) → durch externe Reviews verhindern.

---

## 3. Technische Risiken

| # | Risiko | W | A | Mitigation |
|---|--------|:--:|:--:|------------|
| T1 | **Native-Bridge-Performance** (JS↔Native im heißen Pfad) | M | Hoch | „Thin-JS/Native-Core" strikt durchsetzen; TurboModules/JSI; Batch-Übergaben; Profiling-Budgets ([§5.3 Architektur](./03-Architektur.md)) |
| T2 | **Krypto-Fehlimplementierung** (S/MIME, Key-Mgmt) | N | Kritisch | bewährte Plattform-Krypto statt Eigenbau; Security-Review/Pen-Test; Testvektoren |
| T3 | **Offline-Sync-Konflikte / Datenverlust** | M | Hoch | idempotente Outbox, Konfliktkopien, umfangreiche Sync-Tests, kein stilles Verwerfen |
| T4 | **DB-Performance bei großen Datenmengen** | M | Mittel | Indexierung, Sync-Fenster, Paginierung, FTS5-Tuning, Attachment-Eviction |
| T5 | **Supply-Chain (NPM/native Deps)** | M | Hoch | minimale Deps, Lockfiles, Audits, SBOM, Pinning ([Security R10](./04-Security-Konzept.md)) |

---

## 4. Exchange-/Protokoll-Risiken

| # | Risiko | W | A | Mitigation |
|---|--------|:--:|:--:|------------|
| X1 | **Autodiscover-Vielfalt** realer On-Prem-Setups (SRV, Redirect, Self-Signed-CA, Split-DNS) | H | Hoch | robuste Fallback-Kette; manuelle Konfig als Fallback; per-MDM-Pin-Set; breite Testmatrix |
| X2 | **EWS/EAS-Funktionsunterschiede & Mapping-Drift** | H | Mittel | klare Transport-Abstraktion, kanonisches Domänenmodell, Contract-Tests pro Protokoll |
| X3 | **Auth-Heterogenität** (Basic/NTLM/Kerberos/OAuth, ADFS) | M | Hoch | austauschbare Auth-Provider; frühe Tests gegen reale Setups |
| X4 | **EWS-Deprecation-Trend** (Microsoft) | N | Mittel | betrifft v. a. M365-Cloud; On-Prem stabil; Graph-Connector als Architektur-Option vorbereitet ([ADR-002](./00-Architektur-Entscheidungen-ADR.md#adr-002--exchange-transport-ews--eas-hybrid--autodiscover)) |
| X5 | **Exchange-Versionsspektrum** (2013–2019, SE) | M | Mittel | Versions-Capability-Detection; Test gegen mehrere Server-Versionen |
| X6 | **Throttling-Policies** des Exchange-Servers | M | Mittel | Backoff, Request-Bündelung, Respektieren von Throttling-Headern |

---

## 5. Architektur-Risiken

| # | Risiko | W | A | Mitigation |
|---|--------|:--:|:--:|------------|
| A1 | **Leaky Abstraction** (Protokolldetails sickern nach oben) | M | Mittel | Architekturregeln (kein Protokollwissen oberhalb Transport); Reviews; Lint-Regeln |
| A2 | **Zwei native Codebasen driften auseinander** | M | Mittel | gemeinsame TS-Verträge (`core-transport`); Contract-Tests; geteilte Spezifikation |
| A3 | **Über-Engineering / Scope-Creep** | M | Mittel | strikte MoSCoW-Roadmap; MVP-Disziplin; „Won't-yet"-Liste pflegen |
| A4 | **Monorepo-Build-Komplexität** (RN + 2 native + macOS) | M | Mittel | CI-Matrix, Task-Caching (Nx/Turbo), klare Build-Doku (Phase 10) |

---

## 6. iOS-/RN-/Plattform-Risiken

| # | Risiko | W | A | Mitigation |
|---|--------|:--:|:--:|------------|
| P1 | **Background-Sync-Limits** (iOS BGTask-Budget) | H | Mittel | Direct Push + APNs-Weck-Signal; opportunistisches Sync; realistische Erwartungen |
| P2 | **Akku-/Energieverbrauch** durch Push/Sync | M | Mittel | adaptives Heartbeat, gebündelte Wakeups, Energie-Profiling |
| P3 | **App-Store-/Plattform-Richtlinien** (Hintergrund, Krypto-Export, MDM) | M | Hoch | frühzeitige Compliance-Prüfung; Export-Compliance; Review-Guidelines beachten |
| P4 | **RN-macOS-Reife** (Microsoft-Fork) | M | Mittel | Risiko-Spike früh; ggf. macOS-spezifische native Ergänzungen |
| P5 | **OS-Versions-Fragmentierung** (v. a. Android) | M | Mittel | klare Min-OS-Policy; Geräte-Testmatrix |

---

## 7. Skalierungs-/Organisations-Risiken

| # | Risiko | W | A | Mitigation |
|---|--------|:--:|:--:|------------|
| S1 | **Große Postfächer / hohe Mailvolumina** | M | Hoch | konfigurierbare Sync-Fenster, Lazy-Loading, Paginierung, Performance-Budgets |
| S2 | **Mehrkonten/Mandanten-Skalierung** | M | Mittel | `accountId`-Partitionierung von Beginn an; Ressourcen-Isolation |
| S3 | **Team-/Native-Kompetenz-Engpass** | H | Hoch | frühe Einstellung/Schulung Swift+Kotlin; Native-Lead als Schlüsselrolle |
| S4 | **Test-Infrastruktur** (reale Exchange-Vielfalt) | M | Hoch | dedizierte On-Prem-Exchange-Testumgebung(en), Automatisierung |
| S5 | **Time-to-Market vs. Qualität** | M | Mittel | MVP-Fokus, klare DoD, kein Feature-Gold-Plating vor Markteintritt |

---

## 8. Top-5-Risiken & Sofort-Maßnahmen

1. **X1 Autodiscover-Vielfalt (🟠):** frühest mögliche, breite Testmatrix gegen reale
   On-Prem-Setups; robuste Fallback-Kette + manuelle Konfiguration.
2. **S3 Native-Kompetenz-Engpass (🟠):** Native-Lead und zweite Native-Kraft priorisiert
   besetzen — Engpass für das gesamte Native-Core-Konzept.
3. **T2 Krypto-Fehler (🔴 bei Eintritt):** keine Krypto-Eigenbauten; externe
   Security-Review vor S/MIME-Release.
4. **T1 Bridge-Performance (🟠):** „Thin-JS/Native-Core" als nicht verhandelbare Regel;
   Performance-Budgets in CI verankern.
5. **X3 Auth-Heterogenität (🟠):** Auth als austauschbare Provider früh gegen reale
   ADFS/NTLM/OAuth-Umgebungen testen.

---

## 9. Risiko-Governance

- **Risiko-Review** zu jedem Milestone-Übergang; Heatmap aktualisieren.
- **Spikes** für die größten Unbekannten **vor** der jeweiligen Umsetzung (Autodiscover,
  Direct Push, RN-macOS, S/MIME).
- Risiken mit Eigentümer, Status und Mitigations-Fortschritt im Backlog führen.
