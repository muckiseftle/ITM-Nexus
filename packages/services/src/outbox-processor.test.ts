import { toAccountId, toFolderId, toMessageId } from '@nexus/domain';
import type { BackoffPolicy, OutboxOperation } from '@nexus/core-transport';
import { createOperation, outboxCommand } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { InMemoryMailStore } from './in-memory-store';
import { OutboxProcessor } from './outbox-processor';
import { FakeMailTransport, ManualClock } from './testing/fakes';

const account = toAccountId('acc-1');
const policy: BackoffPolicy = { baseMs: 100, factor: 2, maxMs: 10_000, maxAttempts: 3 };

function moveOp(id: string): OutboxOperation {
  return createOperation(
    id,
    account,
    outboxCommand.move(toMessageId('m-1'), toFolderId('archive')),
    0,
  );
}

describe('OutboxProcessor', () => {
  it('verarbeitet eine eingereihte Operation erfolgreich und entfernt sie', async () => {
    const store = new InMemoryMailStore();
    const transport = new FakeMailTransport();
    const processor = new OutboxProcessor(transport, store, new ManualClock(0), policy);

    await processor.enqueue(account, moveOp('op-1'));
    const result = await processor.processOnce(account);

    expect(result).toEqual({ status: 'success', operationId: 'op-1' });
    expect(transport.appliedOps.map((o) => o.id)).toEqual(['op-1']);
    expect((await store.loadOutbox(account)).entries).toHaveLength(0);
  });

  it('meldet idle, wenn nichts fällig ist', async () => {
    const store = new InMemoryMailStore();
    const processor = new OutboxProcessor(
      new FakeMailTransport(),
      store,
      new ManualClock(0),
      policy,
    );
    expect(await processor.processOnce(account)).toEqual({ status: 'idle' });
  });

  it('plant nach Fehlschlag per Backoff neu und ist erst nach Ablauf wieder fällig', async () => {
    const store = new InMemoryMailStore();
    const clock = new ManualClock(0);
    const transport = new FakeMailTransport({ failApplyTimes: 1 });
    const processor = new OutboxProcessor(transport, store, clock, policy);

    await processor.enqueue(account, moveOp('op-1'));

    const first = await processor.processOnce(account);
    expect(first.status).toBe('failed');
    const failedEntry = (await store.loadOutbox(account)).entries[0];
    expect(failedEntry?.status).toBe('failed');
    expect(failedEntry?.attempts).toBe(1);

    // Noch nicht fällig (Backoff in der Zukunft).
    expect(await processor.processOnce(account)).toEqual({ status: 'idle' });

    // Nach Ablauf des Backoffs: erneuter Versuch gelingt (failApplyTimes verbraucht).
    clock.advance(1000);
    const retry = await processor.processOnce(account);
    expect(retry).toEqual({ status: 'success', operationId: 'op-1' });
    expect((await store.loadOutbox(account)).entries).toHaveLength(0);
  });

  it('drain verarbeitet mehrere fällige Operationen', async () => {
    const store = new InMemoryMailStore();
    const transport = new FakeMailTransport();
    const processor = new OutboxProcessor(transport, store, new ManualClock(0), policy);

    await processor.enqueue(account, moveOp('op-1'));
    await processor.enqueue(account, moveOp('op-2'));
    await processor.enqueue(account, moveOp('op-3'));

    const summary = await processor.drain(account);
    expect(summary).toEqual({ processed: 3, succeeded: 3, failed: 0 });
    expect(transport.appliedOps).toHaveLength(3);
  });
});
