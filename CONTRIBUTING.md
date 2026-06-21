# Mitwirken an NEXUS

Dieses Dokument beschreibt den Entwicklungs-Workflow für das NEXUS-Monorepo. Konzeptuelle
Hintergründe stehen in [`/docs`](./docs/README.md), insbesondere in
[docs/10-Implementierung.md](./docs/10-Implementierung.md).

## Voraussetzungen

- **Node.js 22** (siehe [`.nvmrc`](./.nvmrc))
- **pnpm 10** (`corepack enable` aktiviert die in `package.json` gepinnte Version)

## Erste Schritte

```bash
pnpm install          # Abhängigkeiten installieren
pnpm verify           # typecheck + lint + test:cov in einem Schritt
```

## Befehle

| Befehl | Zweck |
|--------|-------|
| `pnpm build` | Alle Pakete bauen (`tsc -b`, Project References) |
| `pnpm typecheck` | Typprüfung ohne separaten Lauf |
| `pnpm lint` | ESLint inkl. **Architektur-Grenzen** |
| `pnpm format` / `pnpm format:write` | Prettier prüfen / schreiben |
| `pnpm test` / `pnpm test:cov` | Vitest / mit Coverage |
| `pnpm verify` | Komplette lokale Verifikationskette (= CI) |

## Projektstruktur

```
packages/
  domain/          # @nexus/domain        — Domänenmodelle, IDs, reine Helfer
  core-transport/  # @nexus/core-transport — Ports, Fehler, reine Orchestrierung
  ui-kit/          # @nexus/ui-kit        — Design-Tokens
```

> `apps/*` (React Native) und `native/*` (Swift/Kotlin) folgen, sobald die nativen
> Toolchains verfügbar sind — siehe [docs/10](./docs/10-Implementierung.md).

## Architekturregeln (verbindlich)

1. **Schichtentrennung:** `@nexus/domain` darf **keine** höheren Schichten importieren
   (per ESLint erzwungen). Abhängigkeiten zeigen nur „nach unten".
2. **Ports & Adapter:** Seiteneffekte (Netz, Krypto, DB) stehen hinter Port-Interfaces in
   `core-transport`; die reine Logik bleibt testbar und frei von Seiteneffekten.
3. **Thin-JS / Native-Core:** Protokoll-/Krypto-Implementierungen gehören in native Module,
   nicht in TypeScript (siehe ADR-001).

## Coding-Standards

- **TypeScript `strict`** plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **ESLint** `strict-type-checked` + `stylistic-type-checked`.
- Keine `any`, keine Non-Null-Assertions in Produktivcode.
- Jede neue reine Logik braucht **Unit-Tests**.

## Branching & Commits

- **Trunk-Based Development** mit kurzlebigen Feature-Branches.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` …).
- PRs müssen die komplette CI (`pnpm verify`) grün durchlaufen.
