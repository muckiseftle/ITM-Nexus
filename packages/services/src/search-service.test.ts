import { toAccountId, toFolderId, toMessageId } from '@nexus/domain';
import type { SearchHit } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { InMemoryMailStore } from './in-memory-store';
import { SearchService } from './search-service';
import { FakeMailTransport, makeMessage } from './testing/fakes';

const account = toAccountId('acc-1');
const inbox = toFolderId('inbox');

async function seededStore(): Promise<InMemoryMailStore> {
  const store = new InMemoryMailStore();
  await store.upsertMessages([
    makeMessage({
      id: 'm1',
      accountId: account,
      folderId: inbox,
      subject: 'Angebot',
      receivedAt: 10,
    }),
  ]);
  return store;
}

describe('SearchService.search', () => {
  it('führt lokale und serverseitige Treffer zusammen', async () => {
    const store = await seededStore();
    const serverHits: SearchHit[] = [
      { messageId: toMessageId('m1'), rank: 99, source: 'server' }, // Überschneidung → both
      { messageId: toMessageId('m2'), rank: 50, source: 'server' },
    ];
    const service = new SearchService(store, new FakeMailTransport({ serverHits }));

    const results = await service.search(account, 'angebot');

    const m1 = results.find((h) => h.messageId === 'm1');
    expect(m1?.source).toBe('both');
    expect(results.map((h) => h.messageId)).toContain('m2');
  });

  it('bleibt rein lokal, wenn includeServer=false', async () => {
    const store = await seededStore();
    const serverHits: SearchHit[] = [{ messageId: toMessageId('x'), rank: 99, source: 'server' }];
    const service = new SearchService(store, new FakeMailTransport({ serverHits }));

    const results = await service.search(account, 'angebot', { includeServer: false });

    expect(results.map((h) => h.messageId)).toEqual(['m1']);
  });

  it('degradiert bei Serverfehler auf lokale Treffer (Offline-Resilienz)', async () => {
    const store = await seededStore();
    const service = new SearchService(store, new FakeMailTransport({ failServerSearch: true }));

    const results = await service.search(account, 'angebot');

    expect(results.map((h) => h.messageId)).toEqual(['m1']);
  });
});
