#!/usr/bin/env bash
# Graphify-Setup für NEXUS — baut einen lokalen, abfragbaren Code-Wissensgraphen.
#
# Graphify (https://graphify.net) extrahiert Symbole + Beziehungen aus dem Repo (Tree-sitter,
# rein lokal, ohne LLM/API-Key) und stellt sie via MCP-Server für AI-Coding-Assistenten bereit.
# Der Code verlässt dabei NIE das Gerät — passt zur Offline-/Privacy-First-Linie von NEXUS.
#
# Manuell ausführen:  bash scripts/graphify-setup.sh
# (Idempotent: installiert Graphify nur, wenn nötig, und baut den Graphen inkrementell neu.)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export PATH="$HOME/.local/bin:$PATH"

if ! command -v graphify >/dev/null 2>&1; then
  echo "[graphify] installiere graphifyy …"
  if command -v uv >/dev/null 2>&1; then
    uv tool install graphifyy
  elif command -v pipx >/dev/null 2>&1; then
    pipx install graphifyy
  else
    pip3 install --user graphifyy
  fi
fi

echo "[graphify] baue/aktualisiere den Code-Graphen (lokal, ohne LLM) …"
graphify update .
echo "[graphify] fertig → graphify-out/graph.json"
echo "[graphify] MCP-Server starten:  graphify-mcp graphify-out/graph.json"
