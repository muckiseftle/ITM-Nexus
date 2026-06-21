import { toAccountId, toFolderId, toMessageId } from '@nexus/domain';
import type { MailMessage } from '@nexus/domain';
import type { SyncDelta } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { InMemoryMailStore } from './in-memory-store';
import { SyncService } from './sync-service';
import { FakeMailTransport, makeMessage } from './testing/fakes';

const account = toAccountId('acc-1');
const inbox = toFolderId('inbox');

describe('SyncService.syncMessages', () => {
  it('schreibt Created/Updated in den Store und entfernt Deleted', async () => {
    const store = new InMemoryMailStore();
    // Vorbestand: m-old soll durch das Delta gelöscht werden.
    await store.upsertMessages([makeMessage({ id: 'm-old', accountId: account, folderId: inbox })]);

    const delta: SyncDelta<MailMessage> = {
      syncKey: 'sk-1',
      created: [makeMessage({ id: 'm-new', accountId: account, folderId: inbox })],
      updated: [],
      deletedIds: ['m-old'],
      hasMore: true,
    };
    const transport = new FakeMailTransport({ messageDelta: delta });
    const service = new SyncService(transport, store);

    const result = await service.syncMessages(account, inbox);

    expect(result).toEqual({ syncKey: 'sk-1', upserted: 1, deleted: 1, hasMore: true });
    expect(await store.getMessage(account, toMessageId('m-new'))).toBeDefined();
    expect(await store.getMessage(account, toMessageId('m-old'))).toBeUndefined();
  });

  it('kommt mit leerem Delta zurecht', async () => {
    const store = new InMemoryMailStore();
    const service = new SyncService(new FakeMailTransport(), store);
    const result = await service.syncMessages(account, inbox, 'sk-prev');
    expect(result.upserted).toBe(0);
    expect(result.deleted).toBe(0);
  });
});
