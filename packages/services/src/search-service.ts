import type { AccountId } from '@nexus/domain';
import type { MailStore, MailTransport, SearchHit } from '@nexus/core-transport';
import { mergeSearchResults } from '@nexus/core-transport';

export interface SearchOptions {
  /** Serverseitige Suche einbeziehen (Standard: true). Lokal-first bleibt immer aktiv. */
  readonly includeServer?: boolean;
}

/**
 * Hybride Suche: immer zuerst lokal (FTS5-Port), optional ergänzt um Serversuche (EWS).
 * Serverfehler degradieren gracefully zu reinen Lokal-Ergebnissen (Offline-Resilienz).
 */
export class SearchService {
  constructor(
    private readonly store: MailStore,
    private readonly transport: MailTransport,
  ) {}

  async search(accountId: AccountId, query: string, options?: SearchOptions): Promise<SearchHit[]> {
    const local = await this.store.searchLocal(accountId, query);

    if (options?.includeServer === false) {
      return mergeSearchResults(local, []);
    }

    let server: readonly SearchHit[] = [];
    try {
      server = await this.transport.searchServer(accountId, query);
    } catch {
      server = [];
    }
    return mergeSearchResults(local, server);
  }
}
