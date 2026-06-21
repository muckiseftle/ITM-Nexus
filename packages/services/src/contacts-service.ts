import type { AccountId, Contact } from '@nexus/domain';
import type { ContactStore, MailTransport } from '@nexus/core-transport';

export interface ContactsSyncResult {
  readonly syncKey: string;
  readonly upserted: number;
  readonly deleted: number;
  readonly hasMore: boolean;
}

/** Orchestriert Kontakt-Delta-Sync und liefert lokale Kontaktsuche. */
export class ContactsService {
  constructor(
    private readonly transport: MailTransport,
    private readonly store: ContactStore,
  ) {}

  async sync(accountId: AccountId, syncKey?: string): Promise<ContactsSyncResult> {
    const delta = await this.transport.syncContacts(accountId, syncKey);

    const changed = [...delta.created, ...delta.updated];
    if (changed.length > 0) {
      await this.store.upsertContacts(changed);
    }
    if (delta.deletedIds.length > 0) {
      await this.store.deleteContacts(accountId, delta.deletedIds);
    }

    return {
      syncKey: delta.syncKey,
      upserted: changed.length,
      deleted: delta.deletedIds.length,
      hasMore: delta.hasMore,
    };
  }

  search(accountId: AccountId, query: string): Promise<readonly Contact[]> {
    return this.store.search(accountId, query);
  }
}
