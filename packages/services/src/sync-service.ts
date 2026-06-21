import type { AccountId, FolderId } from '@nexus/domain';
import type { MailStore, MailTransport } from '@nexus/core-transport';

export interface SyncResult {
  readonly syncKey: string;
  readonly upserted: number;
  readonly deleted: number;
  readonly hasMore: boolean;
}

/**
 * Orchestriert einen Delta-Sync-Zyklus für einen Ordner: holt das Delta über den
 * Transport-Port und schreibt es in den lokalen Store. Reine Orchestrierung — die
 * konkrete Protokoll-/Persistenz-Arbeit liegt hinter den Ports (nativ).
 */
export class SyncService {
  constructor(
    private readonly transport: MailTransport,
    private readonly store: MailStore,
  ) {}

  async syncMessages(
    accountId: AccountId,
    folderId: FolderId,
    syncKey?: string,
  ): Promise<SyncResult> {
    const delta = await this.transport.syncMessages(accountId, folderId, syncKey);

    const changed = [...delta.created, ...delta.updated];
    if (changed.length > 0) {
      await this.store.upsertMessages(changed);
    }
    if (delta.deletedIds.length > 0) {
      await this.store.deleteMessages(accountId, delta.deletedIds);
    }

    return {
      syncKey: delta.syncKey,
      upserted: changed.length,
      deleted: delta.deletedIds.length,
      hasMore: delta.hasMore,
    };
  }
}
