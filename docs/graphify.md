# Graphify — lokaler Code-Wissensgraph für AI-Coding-Assistenten

[Graphify](https://graphify.net) baut aus diesem Repo einen **abfragbaren Wissensgraphen**
(Symbole + Beziehungen über Tree-sitter) und stellt ihn via **MCP-Server** für AI-Coding-
Assistenten (Claude Code, Cursor, …) bereit. Die Extraktion läuft **rein lokal, ohne LLM/
API-Key** — der Code verlässt nie das Gerät. Das passt zur Offline-/Privacy-First-Linie von NEXUS.

Der generierte Graph (`graphify-out/`) ist **nicht** versioniert (groß, maschinenspezifisch) und
wird per Skript neu gebaut.

## 1. Installieren & Graph bauen

```bash
bash scripts/graphify-setup.sh
```

Das installiert Graphify (`uv tool install graphifyy`, alt.: `pipx`/`pip3`) und baut den Graphen
inkrementell (`graphify update .`, respektiert `.gitignore` → kein `node_modules`). Ergebnis:
`graphify-out/graph.json` (+ `graph.html`, `GRAPH_REPORT.md`).

Bei Codeänderungen einfach erneut `graphify update .` (oder `graphify watch .` zum Live-Aktualisieren).

## 2. Für Claude Code aktivieren (MCP-Server)

> Hinweis: Das automatische Schreiben von `.mcp.json` ist im Auto-Modus bewusst gesperrt
> (es registriert eine ausführbare Integration in der eigenen Toolchain). Bitte **selbst**
> anlegen — Claude Code fragt beim ersten Verbinden um Bestätigung.

`.mcp.json` im Repo-Wurzelverzeichnis anlegen:

```json
{
  "mcpServers": {
    "graphify": {
      "command": "graphify-mcp",
      "args": ["graphify-out/graph.json"]
    }
  }
}
```

Alternativ ohne Datei:

```bash
claude mcp add graphify -- graphify-mcp graphify-out/graph.json
```

Danach stehen in Claude Code die Graph-Abfrage-Tools zur Verfügung (Symbole/Beziehungen/Pfade
nachschlagen, statt nur Volltext zu greppen).

Optional die Graphify-**Skill** zusätzlich installieren (lehrt den Assistenten die CLI-Befehle):

```bash
graphify install --platform claude
```

## 3. Direkt auf der CLI nutzen

```bash
graphify explain "CalendarScreen"        # Knoten + Nachbarn erklären
graphify path "App" "NexusTransport"     # kürzester Pfad zwischen zwei Symbolen
```

## 4. Web-Sessions (ephemere Container)

In Claude-Code-Web-Sessions wird das Repo frisch geklont; `graphify-out/` ist dann leer. Optionen:

- **Manuell pro Session:** `bash scripts/graphify-setup.sh`.
- **Automatisch (SessionStart-Hook):** Das automatische Anlegen ausführender Hooks ist im
  Auto-Modus gesperrt. Wer es möchte, legt `.claude/settings.json` mit folgendem Hook selbst an
  (führt `scripts/graphify-setup.sh` bei jedem Session-Start aus — idempotent, nicht-blockierend):

  ```json
  {
    "hooks": {
      "SessionStart": [
        {
          "hooks": [
            { "type": "command", "command": "bash scripts/graphify-setup.sh", "timeout": 300 }
          ]
        }
      ]
    }
  }
  ```

## Stand in diesem Repo

- `graphify-out/` ist in `.gitignore` aufgenommen.
- `scripts/graphify-setup.sh` installiert + baut den Graphen.
- Der Graph wurde in dieser Sitzung bereits gebaut: **1771 Knoten, 3736 Kanten, 108 Communities**
  aus 194 Quelldateien (TS/TSX/Swift/ObjC).
