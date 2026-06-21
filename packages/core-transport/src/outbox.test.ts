import { toAccountId, toFolderId, toMessageId } from '@nexus/domain';
import { describe, expect, it } from 'vitest';
import type { BackoffPolicy } from './backoff';
import type { OutboxOperation } from './outbox';
import {
  conflicts,
  createOperation,
  emptyOutbox,
  enqueue,
  markInFlight,
  nextRunnable,
  onFailure,
  onSuccess,
  outboxCommand,
} from './outbox';

const account = toAccountId('acc-1');

function op(id: string, createdAt = 0): OutboxOperation {
  return createOperation(
    id,
    account,
    outboxCommand.move(toMessageId('m-1'), toFolderId('archive')),
    createdAt,
  );
}

const fastPolicy: BackoffPolicy = { baseMs: 100, factor: 2, maxMs: 10_000, maxAttempts: 3 };

describe('enqueue', () => {
  it('fügt eine neue Operation als pending hinzu', () => {
    const state = enqueue(emptyOutbox(), op('a'));
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]?.status).toBe('pending');
    expect(state.entries[0]?.attempts).toBe(0);
  });

  it('ist idempotent gegenüber bekannten IDs', () => {
    const once = enqueue(emptyOutbox(), op('a'));
    const twice = enqueue(once, op('a'));
    expect(twice.entries).toHaveLength(1);
    expect(twice).toBe(once); // unveränderter Zustand
  });
});

describe('nextRunnable', () => {
  it('liefert fällige pending-Operationen', () => {
    const state = enqueue(emptyOutbox(), op('a', 100));
    expect(nextRunnable(state, 50)).toBeUndefined();
    expect(nextRunnable(state, 100)?.op.id).toBe('a');
  });

  it('ignoriert inFlight-Operationen', () => {
    const state = markInFlight(enqueue(emptyOutbox(), op('a')), 'a');
    expect(nextRunnable(state, 1000)).toBeUndefined();
  });
});

describe('onSuccess', () => {
  it('entfernt die Operation', () => {
    const state = enqueue(emptyOutbox(), op('a'));
    expect(onSuccess(state, 'a').entries).toHaveLength(0);
  });
});

describe('onFailure', () => {
  it('erhöht attempts und plant per Backoff neu', () => {
    const state = enqueue(emptyOutbox(), op('a'));
    const failed = onFailure(state, 'a', 1000, 'boom', fastPolicy, 1);
    const entry = failed.entries[0];
    expect(entry?.status).toBe('failed');
    expect(entry?.attempts).toBe(1);
    expect(entry?.lastError).toBe('boom');
    // computeBackoff(1, fastPolicy, 1) = 100 → nextAttemptAt = 1100
    expect(entry?.nextAttemptAt).toBe(1100);
  });

  it('markiert nach maxAttempts als conflict', () => {
    let state = enqueue(emptyOutbox(), op('a'));
    state = onFailure(state, 'a', 0, 'e1', fastPolicy, 1);
    state = onFailure(state, 'a', 0, 'e2', fastPolicy, 1);
    state = onFailure(state, 'a', 0, 'e3', fastPolicy, 1);
    expect(state.entries[0]?.status).toBe('conflict');
    expect(state.entries[0]?.attempts).toBe(3);
  });
});

describe('conflicts', () => {
  it('exportiert Konflikte als UI-Kopien', () => {
    let state = enqueue(emptyOutbox(), op('a'));
    for (let i = 0; i < 3; i++) {
      state = onFailure(state, 'a', 0, 'dauerfehler', fastPolicy, 1);
    }
    const list = conflicts(state);
    expect(list).toHaveLength(1);
    expect(list[0]?.operationId).toBe('a');
    expect(list[0]?.lastError).toBe('dauerfehler');
  });

  it('ist leer ohne Konflikte', () => {
    expect(conflicts(enqueue(emptyOutbox(), op('a')))).toHaveLength(0);
  });
});
