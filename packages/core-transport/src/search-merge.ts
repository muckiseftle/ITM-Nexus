import type { MessageId } from '@nexus/domain';

/**
 * Hybride Suche: lokale (FTS5) und serverseitige (EWS) Treffer werden zusammengeführt.
 * Dedupe per `MessageId`, höchster Rang gewinnt, Quelle wird markiert (`both` falls in
 * beiden vorhanden). Reihenfolge: Rang absteigend, bei Gleichstand lokal-zuerst (stabil).
 */

export type SearchSource = 'local' | 'server' | 'both';

export interface SearchHit {
  readonly messageId: MessageId;
  readonly rank: number;
  readonly source: SearchSource;
}

export function mergeSearchResults(
  local: readonly SearchHit[],
  server: readonly SearchHit[],
): SearchHit[] {
  const byId = new Map<MessageId, SearchHit>();

  const ingest = (hit: SearchHit): void => {
    const existing = byId.get(hit.messageId);
    if (existing === undefined) {
      byId.set(hit.messageId, hit);
      return;
    }
    byId.set(hit.messageId, {
      messageId: hit.messageId,
      rank: Math.max(existing.rank, hit.rank),
      source: existing.source === hit.source ? existing.source : 'both',
    });
  };

  for (const hit of local) ingest(hit);
  for (const hit of server) ingest(hit);

  return [...byId.values()].sort((a, b) => b.rank - a.rank);
}
