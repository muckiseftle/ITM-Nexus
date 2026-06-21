import type { AccountId } from '@nexus/domain';
import type {
  BackoffPolicy,
  Clock,
  MailStore,
  MailTransport,
  OutboxOperation,
} from '@nexus/core-transport';
import {
  defaultBackoff,
  enqueue,
  isTransportError,
  markInFlight,
  nextRunnable,
  onFailure,
  onSuccess,
} from '@nexus/core-transport';

export type ProcessResult =
  | { readonly status: 'idle' }
  | { readonly status: 'success'; readonly operationId: string }
  | { readonly status: 'failed'; readonly operationId: string; readonly error: string };

export interface DrainSummary {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
}

function describeError(error: unknown): string {
  if (isTransportError(error)) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unbekannter Fehler';
}

/**
 * Treibt die Outbox: reiht Operationen ein und führt fällige Operationen über den
 * Transport-Port aus — mit optimistischer Persistenz, idempotenter Wiederholung und
 * Backoff (alles via die reine {@link OutboxState}-State-Machine aus core-transport).
 */
export class OutboxProcessor {
  constructor(
    private readonly transport: MailTransport,
    private readonly store: MailStore,
    private readonly clock: Clock,
    private readonly policy: BackoffPolicy = defaultBackoff,
  ) {}

  async enqueue(accountId: AccountId, operation: OutboxOperation): Promise<void> {
    const state = await this.store.loadOutbox(accountId);
    await this.store.saveOutbox(accountId, enqueue(state, operation));
  }

  /** Verarbeitet höchstens eine fällige Operation. */
  async processOnce(accountId: AccountId): Promise<ProcessResult> {
    const initial = await this.store.loadOutbox(accountId);
    const entry = nextRunnable(initial, this.clock.now());
    if (entry === undefined) {
      return { status: 'idle' };
    }

    await this.store.saveOutbox(accountId, markInFlight(initial, entry.op.id));

    try {
      await this.transport.applyOperation(entry.op);
      const current = await this.store.loadOutbox(accountId);
      await this.store.saveOutbox(accountId, onSuccess(current, entry.op.id));
      return { status: 'success', operationId: entry.op.id };
    } catch (error) {
      const message = describeError(error);
      const current = await this.store.loadOutbox(accountId);
      await this.store.saveOutbox(
        accountId,
        onFailure(current, entry.op.id, this.clock.now(), message, this.policy),
      );
      return { status: 'failed', operationId: entry.op.id, error: message };
    }
  }

  /** Verarbeitet fällige Operationen, bis nichts mehr fällig ist (oder `maxOperations`). */
  async drain(accountId: AccountId, maxOperations = 50): Promise<DrainSummary> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < maxOperations; i++) {
      const result = await this.processOnce(accountId);
      if (result.status === 'idle') {
        break;
      }
      processed += 1;
      if (result.status === 'success') {
        succeeded += 1;
      } else {
        failed += 1;
      }
    }

    return { processed, succeeded, failed };
  }
}
