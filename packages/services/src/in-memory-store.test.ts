import { toAccountId, toFolderId, toMessageId } from '@nexus/domain';
import { createOperation, enqueue, outboxCommand } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { InMemoryMailStore, InMemorySecureStore } from './in-memory-store';
import { makeMessage } from './testing/fakes';

const account = toAccountId('acc-1');
const inbox = toFolderId('inbox');

describe('InMemoryMailStore', () => {
  it('macht Nachrichten persistent und liest sie zurück', async () => {
    const store = new InMemoryMailStore();
    await store.upsertMessages([makeMessage({ id: 'm1', accountId: account, folderId: inbox })]);
    const got = await store.getMessage(account, toMessageId('m1'));
    expect(got?.id).toBe('m1');
  });

  it('listet Ordner nach Empfangszeit absteigend mit Paginierung', async () => {
    const store = new InMemoryMailStore();
    await store.upsertMessages([
      makeMessage({ id: 'm1', accountId: account, folderId: inbox, receivedAt: 100 }),
      makeMessage({ id: 'm2', accountId: account, folderId: inbox, receivedAt: 300 }),
      makeMessage({ id: 'm3', accountId: account, folderId: inbox, receivedAt: 200 }),
    ]);
    const page = await store.listFolder(account, inbox, 2, 0);
    expect(page.map((m) => m.id)).toEqual(['m2', 'm3']);
  });

  it('löscht Nachrichten', async () => {
    const store = new InMemoryMailStore();
    await store.upsertMessages([makeMessage({ id: 'm1', accountId: account, folderId: inbox })]);
    await store.deleteMessages(account, ['m1']);
    expect(await store.getMessage(account, toMessageId('m1'))).toBeUndefined();
  });

  it('durchsucht Betreff und Vorschau case-insensitiv', async () => {
    const store = new InMemoryMailStore();
    await store.upsertMessages([
      makeMessage({ id: 'm1', accountId: account, folderId: inbox, subject: 'Angebot Q3' }),
      makeMessage({
        id: 'm2',
        accountId: account,
        folderId: inbox,
        preview: 'rund um das ANGEBOT',
      }),
      makeMessage({ id: 'm3', accountId: account, folderId: inbox, subject: 'Urlaub' }),
    ]);
    const hits = await store.searchLocal(account, 'angebot');
    expect(hits.map((h) => h.messageId).sort()).toEqual(['m1', 'm2']);
    expect(hits.every((h) => h.source === 'local')).toBe(true);
  });

  it('liefert eine leere Outbox als Default und speichert Zustände', async () => {
    const store = new InMemoryMailStore();
    expect((await store.loadOutbox(account)).entries).toHaveLength(0);

    const op = createOperation('op-1', account, outboxCommand.markRead(toMessageId('m1'), true), 0);
    await store.saveOutbox(account, enqueue(await store.loadOutbox(account), op));
    expect((await store.loadOutbox(account)).entries).toHaveLength(1);
  });
});

describe('InMemorySecureStore', () => {
  it('legt Werte ab, liest, löscht und wiped', async () => {
    const secure = new InMemorySecureStore();
    await secure.set('k', 'v');
    expect(await secure.get('k')).toBe('v');
    await secure.delete('k');
    expect(await secure.get('k')).toBeUndefined();

    await secure.set('a', '1');
    await secure.wipe();
    expect(await secure.get('a')).toBeUndefined();
  });
});
