import { Importance } from './enums';
import type { FolderId } from './ids';
import type { MailMessage } from './models';

/**
 * Reine, client-seitige Regelmaschine. Wertet Regeln deterministisch gegen eine Nachricht
 * aus und liefert die anzuwendenden Aktionen. Seiteneffekte (Store/Outbox) übernimmt der
 * `RuleProcessor` in der Service-Schicht.
 */

export type RuleCondition =
  | { readonly type: 'fromContains'; readonly value: string }
  | { readonly type: 'toContains'; readonly value: string }
  | { readonly type: 'subjectContains'; readonly value: string }
  | { readonly type: 'hasAttachment' }
  | { readonly type: 'importanceIs'; readonly importance: Importance };

export type RuleAction =
  | { readonly type: 'moveToFolder'; readonly folderId: FolderId }
  | { readonly type: 'markRead' }
  | { readonly type: 'flag' }
  | { readonly type: 'addCategory'; readonly category: string }
  | { readonly type: 'delete' }
  | { readonly type: 'stopProcessing' };

export interface Rule {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  /** `all` = alle Bedingungen müssen zutreffen, `any` = mindestens eine. */
  readonly match: 'all' | 'any';
  readonly conditions: readonly RuleCondition[];
  readonly actions: readonly RuleAction[];
}

function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function evaluateCondition(message: MailMessage, condition: RuleCondition): boolean {
  switch (condition.type) {
    case 'fromContains':
      return (
        includesCI(message.from.address, condition.value) ||
        (message.from.displayName !== undefined &&
          includesCI(message.from.displayName, condition.value))
      );
    case 'toContains':
      return message.recipients.some((r) => includesCI(r.address.address, condition.value));
    case 'subjectContains':
      return includesCI(message.subject, condition.value);
    case 'hasAttachment':
      return message.hasAttachments;
    case 'importanceIs':
      return message.importance === condition.importance;
  }
}

/**
 * Trifft die Regel auf die Nachricht zu? Deaktivierte Regeln nie. Eine Regel **ohne**
 * Bedingungen trifft immer zu (gilt für alle Nachrichten).
 */
export function evaluateRule(message: MailMessage, rule: Rule): boolean {
  if (!rule.enabled) {
    return false;
  }
  if (rule.conditions.length === 0) {
    return true;
  }
  return rule.match === 'all'
    ? rule.conditions.every((c) => evaluateCondition(message, c))
    : rule.conditions.some((c) => evaluateCondition(message, c));
}

/**
 * Sammelt die Aktionen aller zutreffenden Regeln in Reihenfolge. `stopProcessing` beendet
 * die Auswertung nach der aktuellen Regel (deren Aktionen inkl. `stopProcessing` noch
 * aufgenommen werden).
 */
export function applyRules(message: MailMessage, rules: readonly Rule[]): RuleAction[] {
  const actions: RuleAction[] = [];
  for (const rule of rules) {
    if (!evaluateRule(message, rule)) {
      continue;
    }
    let stop = false;
    for (const action of rule.actions) {
      actions.push(action);
      if (action.type === 'stopProcessing') {
        stop = true;
      }
    }
    if (stop) {
      break;
    }
  }
  return actions;
}
