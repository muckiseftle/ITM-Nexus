import { FolderType, toAccountId } from '@nexus/domain';
import type { MailFolder } from '@nexus/domain';
import type { SyncDelta } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { FolderSyncService } from './folder-sync-service';
import { InMemoryFolderStore } from './in-memory-store';
import { FakeMailTransport, makeFolder } from './testing/fakes';

const account = toAccountId('acc-1');

describe('FolderSyncService', () => {
  it('synchronisiert Ordner in den Store und entfernt gelöschte', async () => {
    const store = new InMemoryFolderStore();
    await store.upsertFolders([makeFolder({ id: 'old', accountId: account, displayName: 'Alt' })]);

    const delta: SyncDelta<MailFolder> = {
      syncKey: 'sk-1',
      created: [
        makeFolder({
          id: 'inbox',
          accountId: account,
          displayName: 'Posteingang',
          type: FolderType.Inbox,
        }),
      ],
      updated: [],
      deletedIds: ['old'],
      hasMore: false,
    };
    const service = new FolderSyncService(new FakeMailTransport({ folderDelta: delta }), store);

    const result = await service.sync(account);
    expect(result).toEqual({ syncKey: 'sk-1', upserted: 1, deleted: 1, hasMore: false });

    const folders = await service.listFolders(account);
    expect(folders.map((f) => f.id)).toEqual(['inbox']);
  });
});
