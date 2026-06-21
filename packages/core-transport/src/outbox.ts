import type { AccountId } from '@nexus/domain';
import type { BackoffPolicy } from './backoff';
import { computeBackoff, defaultBackoff } from './backoff';

/**
 * Reine, immutable Outbox-State-Machine. Sie modelliert die *Entscheidungslogik* für
 * ausgehende Operationen (Ordnung, Retry, Backoff, Konflikt). Persistenz (SQLCipher) und
 * tatsächliche Server-Ausführung liegen in nativen Adaptern hinter den Ports —
 * siehe `MailStore` / `MailTransport`.
 */

export type OutboxOpKind = 'send' | 'move' | 'flag' | 'delete' | 'markRead';

export interface OutboxOperation {
  /** Idempotenz-Schlüssel: identische IDs werden nicht doppelt eingereiht. */
  readonly id: string;
  readonly kind: OutboxOpKind;
  readonly accountId: AccountId;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
}

export type OutboxStatus = 'pending' | 'inFlight' | 'failed' | 'conflict';

export interface OutboxEntry {
  readonly op: OutboxOperation;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly nextAttemptAt: number;
  readonly lastError?: string;
}

export interface OutboxState {
  readonly entries: readonly OutboxEntry[];
}

/** Für die UI sichtbar gemachter, nicht mehr automatisch auflösbarer Konflikt. */
export interface ConflictCopy {
  readonly operationId: string;
  readonly kind: OutboxOpKind;
  readonly accountId: AccountId;
  readonly attempts: number;
  readonly lastError: string;
}

export function emptyOutbox(): OutboxState {
  return { entries: [] };
}

/** Reiht eine Operation ein. Idempotent: bekannte IDs lassen den Zustand unverändert. */
export function enqueue(state: OutboxState, op: OutboxOperation): OutboxState {
  if (state.entries.some((e) => e.op.id === op.id)) {
    return state;
  }
  const entry: OutboxEntry = {
    op,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: op.createdAt,
  };
  return { entries: [...state.entries, entry] };
}

/** Erste fällige Operation (pending/failed mit erreichtem `nextAttemptAt`). */
export function nextRunnable(state: OutboxState, now: number): OutboxEntry | undefined {
  return state.entries.find(
    (e) => (e.status === 'pending' || e.status === 'failed') && e.nextAttemptAt <= now,
  );
}

function update(
  state: OutboxState,
  id: string,
  fn: (entry: OutboxEntry) => OutboxEntry | undefined,
): OutboxState {
  const entries: OutboxEntry[] = [];
  for (const entry of state.entries) {
    if (entry.op.id !== id) {
      entries.push(entry);
      continue;
    }
    const next = fn(entry);
    if (next !== undefined) {
      entries.push(next);
    }
  }
  return { entries };
}

export function markInFlight(state: OutboxState, id: string): OutboxState {
  return update(state, id, (e) => ({ ...e, status: 'inFlight' }));
}

/** Erfolgreiche Ausführung: Operation wird aus der Outbox entfernt. */
export function onSuccess(state: OutboxState, id: string): OutboxState {
  return update(state, id, () => undefined);
}

/**
 * Fehlgeschlagene Ausführung: erhöht den Zähler, plant per Backoff neu — oder markiert
 * die Operation nach Erreichen von `maxAttempts` als `conflict`.
 */
export function onFailure(
  state: OutboxState,
  id: string,
  now: number,
  error: string,
  policy: BackoffPolicy = defaultBackoff,
  jitter = 0,
): OutboxState {
  return update(state, id, (e) => {
    const attempts = e.attempts + 1;
    if (attempts >= policy.maxAttempts) {
      return { ...e, status: 'conflict', attempts, lastError: error, nextAttemptAt: now };
    }
    const delay = computeBackoff(attempts, policy, jitter);
    return { ...e, status: 'failed', attempts, lastError: error, nextAttemptAt: now + delay };
  });
}

/** Alle Konflikt-Operationen als UI-taugliche Kopien. */
export function conflicts(state: OutboxState): ConflictCopy[] {
  return state.entries
    .filter((e) => e.status === 'conflict')
    .map((e) => ({
      operationId: e.op.id,
      kind: e.op.kind,
      accountId: e.op.accountId,
      attempts: e.attempts,
      lastError: e.lastError ?? 'unbekannt',
    }));
}
