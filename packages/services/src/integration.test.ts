import {
  BodyType,
  createMailAddress,
  groupByConversation,
  markRead,
  toAccountId,
  toFolderId,
  toMessageId,
} from '@nexus/domain';
import type { MailMessage, Mailbox } from '@nexus/domain';
import type { SyncDelta } from '@nexus/core-transport';
import { createOperation, outboxCommand } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { InMemoryMailStore, InMemorySecureStore } from './in-memory-store';
import { AccountSetupService } from './account-setup-service';
import { ComposeService } from './compose-service';
import { OutboxProcessor } from './outbox-processor';
import { SearchService } from './search-service';
import { SyncService } from './sync-service';
import { FakeMailTransport, ManualClock, makeMessage } from './testing/fakes';

const account = toAccountId('acc-1');
const inbox = toFolderId('inbox');
const archive = toFolderId('archive');

/**
 * End-to-End-Szenario über den gesamten verifizierbaren Stack (Domain → core-transport →
 * services → In-Memory-Adapter): Konto-Setup, Sync, Offline-Triage (optimistische lokale
 * Änderung + Outbox), Drain und Suche. Persona „Markus" (Power-User, Offline-Triage).
 */
describe('Integration: Offline-Triage', () => {
  it('Setup → Sync → optimistische Aktionen → Outbox-Drain → Suche', async () => {
    const store = new InMemoryMailStore();
    const secure = new InMemorySecureStore();
    const clock = new ManualClock(0);

    const delta: SyncDelta<MailMessage> = {
      syncKey: 'sk-1',
      created: [
        makeMessage({
          id: 'm1',
          accountId: account,
          folderId: inbox,
          subject: 'Angebot Q3',
          receivedAt: 100,
        }),
        makeMessage({
          id: 'm2',
          accountId: account,
          folderId: inbox,
          subject: 'Re: Angebot Q3',
          receivedAt: 200,
        }),
        makeMessage({
          id: 'm3',
          accountId: account,
          folderId: inbox,
          subject: 'Urlaubsplanung',
          receivedAt: 300,
        }),
      ],
      updated: [],
      deletedIds: [],
      hasMore: false,
    };
    // m1 und m2 gehören zur selben Konversation.
    const withConversation = delta.created.map((m) =>
      m.id === 'm1' || m.id === 'm2' ? { ...m, conversationId: 'conv-A' } : m,
    );
    const transport = new FakeMailTransport({
      messageDelta: { ...delta, created: withConversation },
    });

    const setup = new AccountSetupService(transport, secure);
    const sync = new SyncService(transport, store);
    const outbox = new OutboxProcessor(transport, store, clock);
    const search = new SearchService(store, transport);

    // 1) Konto einrichten — Secret landet ausschließlich im SecureStore.
    await setup.setUp('markus@example.com', { username: 'markus', secret: 'pw', scheme: 'ntlm' });
    expect(await secure.get('nexus:secret:markus@example.com')).toBe('pw');

    // 2) Erst-Sync.
    const syncResult = await sync.syncMessages(account, inbox);
    expect(syncResult.upserted).toBe(3);

    // 3) Konversations-Threading: conv-A bündelt m1+m2, alle drei ungelesen.
    const initialInbox = await store.listFolder(account, inbox, 100, 0);
    const conversations = groupByConversation(initialInbox);
    const convA = conversations.find((c) => c.conversationId === 'conv-A');
    expect(convA?.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(conversations.reduce((sum, c) => sum + c.unreadCount, 0)).toBe(3);

    // 4) Offline-Triage (optimistisch lokal anwenden + Outbox einreihen):
    //    m1 als gelesen markieren, m3 ins Archiv verschieben.
    const m1 = await store.getMessage(account, toMessageId('m1'));
    if (m1 !== undefined) {
      await store.upsertMessages([markRead(m1, true)]);
    }
    await outbox.enqueue(
      account,
      createOperation(
        'op-read-m1',
        account,
        outboxCommand.markRead(toMessageId('m1'), true),
        clock.now(),
      ),
    );

    const m3 = await store.getMessage(account, toMessageId('m3'));
    if (m3 !== undefined) {
      await store.upsertMessages([{ ...m3, folderId: archive }]);
    }
    await outbox.enqueue(
      account,
      createOperation(
        'op-move-m3',
        account,
        outboxCommand.move(toMessageId('m3'), archive),
        clock.now(),
      ),
    );

    // 5) Outbox abarbeiten — beide Operationen werden gegen den Server ausgeführt.
    const summary = await outbox.drain(account);
    expect(summary).toEqual({ processed: 2, succeeded: 2, failed: 0 });
    expect(transport.appliedOps.map((o) => o.id).sort()).toEqual(['op-move-m3', 'op-read-m1']);
    expect((await store.loadOutbox(account)).entries).toHaveLength(0);

    // 6) Lokaler Zustand spiegelt die Triage: Inbox ohne m3, ein ungelesenes weniger.
    const afterInbox = await store.listFolder(account, inbox, 100, 0);
    expect(afterInbox.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    const afterUnread = groupByConversation(afterInbox).reduce((s, c) => s + c.unreadCount, 0);
    expect(afterUnread).toBe(1);

    // 7) Suche findet die Angebots-Konversation lokal-first.
    const hits = await search.search(account, 'angebot');
    expect(hits.map((h) => h.messageId).sort()).toEqual(['m1', 'm2']);
  });
});

/**
 * Szenario „Persona Sandra" (Assistenz): sendet eine Nachricht im Auftrag des
 * delegierten Vorstands-Postfachs über den Outbox-Pfad.
 */
describe('Integration: Delegation (Senden im Auftrag)', () => {
  it('löst SendOnBehalf auf und stellt die Nachricht über die Outbox zu', async () => {
    const store = new InMemoryMailStore();
    const transport = new FakeMailTransport();
    const clock = new ManualClock(0);
    const outbox = new OutboxProcessor(transport, store, clock);
    const compose = new ComposeService(outbox, clock);

    const sandra = createMailAddress('assistenz@example.com');
    const bossMailbox: Mailbox = {
      id: 'boss',
      kind: 'delegated',
      address: createMailAddress('vorstand@example.com'),
      displayName: 'Vorstand',
      permissions: ['read', 'write', 'sendOnBehalf'],
    };

    await compose.send(account, 'op-onbehalf', bossMailbox, sandra, {
      subject: 'Terminbestätigung',
      body: { type: BodyType.Text, content: 'Der Termin ist bestätigt.' },
      recipients: [{ kind: 'to', address: createMailAddress('extern@example.com') }],
    });

    const summary = await outbox.drain(account);
    expect(summary).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    const applied = transport.appliedOps[0];
    expect(applied?.command.type).toBe('send');
    if (applied?.command.type === 'send') {
      // Erscheint als „Vorstand", Sender ist die Assistenz (im Auftrag).
      expect(applied.command.message.from.address).toBe('vorstand@example.com');
      expect(applied.command.message.sender?.address).toBe('assistenz@example.com');
    }
  });
});
