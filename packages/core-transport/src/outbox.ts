import type { AccountId, FolderId, MessageFlag, MessageId, OutgoingMessage } from '@nexus/domain';
import type { BackoffPolicy } from './backoff';
import { computeBackoff, defaultBackoff } from './backoff';

/**
 * Reine, immutable Outbox-State-Machine. Sie modelliert die *Entscheidungslogik* für
 * ausgehende Operationen (Ordnung, Retry, Backoff, Konflikt). Persistenz (SQLCipher) und
 * tatsächliche Server-Ausführung liegen in nativen Adaptern hinter den Ports —
 * siehe `MailStore` / `MailTransport`.
 */

/** Typsicher diskriminierte Outbox-Befehle (statt eines losen Payloads). */
export type OutboxCommand =
  | { readonly type: 'send'; readonly message: OutgoingMessage }
  | { readonly type: 'move'; readonly messageId: MessageId; readonly targetFolderId: FolderId }
  | {
      readonly type: 'flag';
      readonly messageId: MessageId;
      readonly flag: MessageFlag;
      readonly value: boolean;
    }
  | { readonly type: 'delete'; readonly messageId: MessageId }
  | { readonly type: 'markRead'; readonly messageId: MessageId; readonly read: boolean };

export type OutboxCommandType = OutboxCommand['type'];

export interface OutboxOperation {
  /** Idempotenz-Schlüssel: identische IDs werden nicht doppelt eingereiht. */
  readonly id: string;
  readonly accountId: AccountId;
  readonly command: OutboxCommand;
  readonly createdAt: number;
}

/** Bequeme, typsichere Konstruktoren für {@link OutboxCommand}. */
export const outboxCommand = {
  send: (message: OutgoingMessage): OutboxCommand => ({ type: 'send', message }),
  move: (messageId: MessageId, targetFolderId: FolderId): OutboxCommand => ({
    type: 'move',
    messageId,
    targetFolderId,
  }),
  flag: (messageId: MessageId, flag: MessageFlag, value: boolean): OutboxCommand => ({
    type: 'flag',
    messageId,
    flag,
    value,
  }),
  remove: (messageId: MessageId): OutboxCommand => ({ type: 'delete', messageId }),
  markRead: (messageId: MessageId, read: boolean): OutboxCommand => ({
    type: 'markRead',
    messageId,
    read,
  }),
} as const;

/** Baut eine vollständige {@link OutboxOperation} (Envelope + Befehl). */
export function createOperation(
  id: string,
  accountId: AccountId,
  command: OutboxCommand,
  createdAt: number,
): OutboxOperation {
  return { id, accountId, command, createdAt };
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
  readonly commandType: OutboxCommandType;
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
      commandType: e.op.command.type,
      accountId: e.op.accountId,
      attempts: e.attempts,
      lastError: e.lastError ?? 'unbekannt',
    }));
}
