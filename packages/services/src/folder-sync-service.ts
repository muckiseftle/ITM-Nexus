import type { AccountId, MailFolder } from '@nexus/domain';
import type { FolderStore, MailTransport } from '@nexus/core-transport';

export interface FolderSyncResult {
  readonly syncKey: string;
  readonly upserted: number;
  readonly deleted: number;
  readonly hasMore: boolean;
}

/** Orchestriert den Delta-Sync der Ordnerstruktur (Muster: {@link SyncService}). */
export class FolderSyncService {
  constructor(
    private readonly transport: MailTransport,
    private readonly store: FolderStore,
  ) {}

  async sync(accountId: AccountId, syncKey?: string): Promise<FolderSyncResult> {
    const delta = await this.transport.syncFolders(accountId, syncKey);

    const changed = [...delta.created, ...delta.updated];
    if (changed.length > 0) {
      await this.store.upsertFolders(changed);
    }
    if (delta.deletedIds.length > 0) {
      await this.store.deleteFolders(accountId, delta.deletedIds);
    }

    return {
      syncKey: delta.syncKey,
      upserted: changed.length,
      deleted: delta.deletedIds.length,
      hasMore: delta.hasMore,
    };
  }

  listFolders(accountId: AccountId): Promise<readonly MailFolder[]> {
    return this.store.listFolders(accountId);
  }
}
