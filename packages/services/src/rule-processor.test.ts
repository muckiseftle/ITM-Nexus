import { toAccountId, toFolderId, toMessageId } from '@nexus/domain';
import type { Rule } from '@nexus/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryMailStore } from './in-memory-store';
import { OutboxProcessor } from './outbox-processor';
import { RuleProcessor } from './rule-processor';
import { FakeMailTransport, ManualClock, makeMessage } from './testing/fakes';

const account = toAccountId('acc-1');
const inbox = toFolderId('inbox');
const archive = toFolderId('archive');

function harness() {
  const store = new InMemoryMailStore();
  const transport = new FakeMailTransport();
  const clock = new ManualClock(0);
  const outbox = new OutboxProcessor(transport, store, clock);
  const processor = new RuleProcessor(store, outbox, clock);
  return { store, transport, outbox, processor };
}

describe('RuleProcessor', () => {
  it('wendet markRead + Kategorie optimistisch an und spiegelt sie in die Outbox', async () => {
    const { store, transport, outbox, processor } = harness();
    const message = makeMessage({
      id: 'm1',
      accountId: account,
      folderId: inbox,
      subject: 'Newsletter',
    });
    await store.upsertMessages([message]);

    const rule: Rule = {
      id: 'r1',
      name: 'Newsletter',
      enabled: true,
      match: 'all',
      conditions: [{ type: 'subjectContains', value: 'newsletter' }],
      actions: [{ type: 'markRead' }, { type: 'addCategory', category: 'Newsletter' }],
    };

    const result = await processor.process(account, message, [rule]);
    expect(result).toEqual({ matched: true, actionsApplied: 2, deleted: false, enqueued: 2 });

    // Lokaler Zustand optimistisch aktualisiert.
    const stored = await store.getMessage(account, toMessageId('m1'));
    expect(stored?.flags).toContain('read');
    expect(stored?.categories).toEqual(['Newsletter']);

    // Outbox-Spiegelung gegen den Server.
    const summary = await outbox.drain(account);
    expect(summary).toEqual({ processed: 2, succeeded: 2, failed: 0 });
    const types = transport.appliedOps.map((o) => o.command.type).sort();
    expect(types).toEqual(['markRead', 'setCategories']);
  });

  it('verschiebt und nutzt deterministische, idempotente Operation-IDs', async () => {
    const { store, outbox, processor } = harness();
    const message = makeMessage({ id: 'm2', accountId: account, folderId: inbox });
    await store.upsertMessages([message]);

    const rule: Rule = {
      id: 'r-move',
      name: 'Archivieren',
      enabled: true,
      match: 'all',
      conditions: [],
      actions: [{ type: 'moveToFolder', folderId: archive }],
    };

    // Zweimaliges Verarbeiten erzeugt dieselbe Operation-ID → keine Dopplung.
    await processor.process(account, message, [rule]);
    await processor.process(account, message, [rule]);

    expect((await store.getMessage(account, toMessageId('m2')))?.folderId).toBe('archive');
    expect((await outbox.drain(account)).processed).toBe(1);
  });

  it('löscht lokal und reiht genau einen delete-Befehl ein', async () => {
    const { store, transport, outbox, processor } = harness();
    const message = makeMessage({ id: 'm3', accountId: account, folderId: inbox, subject: 'Spam' });
    await store.upsertMessages([message]);

    const rule: Rule = {
      id: 'r-del',
      name: 'Spam',
      enabled: true,
      match: 'all',
      conditions: [{ type: 'subjectContains', value: 'spam' }],
      actions: [{ type: 'delete' }],
    };

    const result = await processor.process(account, message, [rule]);
    expect(result.deleted).toBe(true);
    expect(await store.getMessage(account, toMessageId('m3'))).toBeUndefined();

    await outbox.drain(account);
    expect(transport.appliedOps.map((o) => o.command.type)).toEqual(['delete']);
  });

  it('tut nichts, wenn keine Regel zutrifft', async () => {
    const { processor } = harness();
    const message = makeMessage({
      id: 'm4',
      accountId: account,
      folderId: inbox,
      subject: 'Hallo',
    });
    const rule: Rule = {
      id: 'r-x',
      name: 'X',
      enabled: true,
      match: 'all',
      conditions: [{ type: 'subjectContains', value: 'gibt-es-nicht' }],
      actions: [{ type: 'markRead' }],
    };
    const result = await processor.process(account, message, [rule]);
    expect(result).toEqual({ matched: false, actionsApplied: 0, deleted: false, enqueued: 0 });
  });
});
