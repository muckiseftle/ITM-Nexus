import type { AccountId, MailMessage, Rule } from '@nexus/domain';
import { MessageFlag, applyRules, markRead, withCategory, withFlag } from '@nexus/domain';
import type { Clock, MailStore, OutboxCommand, OutboxOperation } from '@nexus/core-transport';
import { createOperation, outboxCommand } from '@nexus/core-transport';
import type { OutboxProcessor } from './outbox-processor';

export interface RuleProcessResult {
  readonly matched: boolean;
  readonly actionsApplied: number;
  readonly deleted: boolean;
  readonly enqueued: number;
}

/**
 * Wendet client-seitige Regeln auf eine Nachricht an: faltet die Aktionen aus
 * {@link applyRules} zu einem optimistischen lokalen Zielzustand, persistiert ihn und
 * spiegelt die Änderungen idempotent über die Outbox (deterministische Operation-IDs).
 */
export class RuleProcessor {
  constructor(
    private readonly store: MailStore,
    private readonly outbox: OutboxProcessor,
    private readonly clock: Clock,
  ) {}

  async process(
    accountId: AccountId,
    message: MailMessage,
    rules: readonly Rule[],
  ): Promise<RuleProcessResult> {
    const actions = applyRules(message, rules);

    let current = message;
    let deleted = false;
    let markedRead = false;
    let flagged = false;
    let categoriesChanged = false;
    let moved = false;

    for (const action of actions) {
      switch (action.type) {
        case 'markRead':
          current = markRead(current, true);
          markedRead = true;
          break;
        case 'flag':
          current = withFlag(current, MessageFlag.Flagged);
          flagged = true;
          break;
        case 'addCategory':
          current = withCategory(current, action.category);
          categoriesChanged = true;
          break;
        case 'moveToFolder':
          current = { ...current, folderId: action.folderId };
          moved = true;
          break;
        case 'delete':
          deleted = true;
          break;
        case 'stopProcessing':
          break;
      }
    }

    // Optimistische lokale Persistenz.
    if (deleted) {
      await this.store.deleteMessages(accountId, [message.id]);
    } else {
      await this.store.upsertMessages([current]);
    }

    // Idempotente Outbox-Spiegelung mit deterministischen IDs.
    const commands: { readonly suffix: string; readonly command: OutboxCommand }[] = [];
    if (deleted) {
      commands.push({ suffix: 'delete', command: outboxCommand.remove(message.id) });
    } else {
      if (markedRead) {
        commands.push({ suffix: 'markRead', command: outboxCommand.markRead(message.id, true) });
      }
      if (flagged) {
        commands.push({
          suffix: 'flag',
          command: outboxCommand.flag(message.id, MessageFlag.Flagged, true),
        });
      }
      if (categoriesChanged) {
        commands.push({
          suffix: 'setCategories',
          command: outboxCommand.setCategories(message.id, current.categories),
        });
      }
      if (moved) {
        commands.push({
          suffix: 'move',
          command: outboxCommand.move(message.id, current.folderId),
        });
      }
    }

    for (const { suffix, command } of commands) {
      const op: OutboxOperation = createOperation(
        `${message.id}:${suffix}`,
        accountId,
        command,
        this.clock.now(),
      );
      await this.outbox.enqueue(accountId, op);
    }

    return {
      matched: actions.length > 0,
      actionsApplied: actions.length,
      deleted,
      enqueued: commands.length,
    };
  }
}
