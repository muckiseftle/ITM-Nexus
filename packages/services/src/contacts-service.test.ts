import { toAccountId } from '@nexus/domain';
import type { Contact } from '@nexus/domain';
import type { SyncDelta } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { ContactsService } from './contacts-service';
import { InMemoryContactStore } from './in-memory-store';
import { FakeMailTransport, makeContact } from './testing/fakes';

const account = toAccountId('acc-1');

describe('ContactsService', () => {
  it('synchronisiert Kontakte und durchsucht Name und E-Mail', async () => {
    const store = new InMemoryContactStore();
    const delta: SyncDelta<Contact> = {
      syncKey: 'sk-1',
      created: [
        makeContact({
          id: 'c1',
          accountId: account,
          displayName: 'Sandra Keil',
          email: 's.keil@example.com',
        }),
        makeContact({
          id: 'c2',
          accountId: account,
          displayName: 'Markus Brandt',
          email: 'm.brandt@example.com',
        }),
      ],
      updated: [],
      deletedIds: [],
      hasMore: false,
    };
    const service = new ContactsService(new FakeMailTransport({ contactDelta: delta }), store);

    const result = await service.sync(account);
    expect(result.upserted).toBe(2);

    expect((await service.search(account, 'keil')).map((c) => c.id)).toEqual(['c1']);
    expect((await service.search(account, 'brandt@example')).map((c) => c.id)).toEqual(['c2']);
  });
});
