import { describe, expect, it } from 'vitest';
import { Importance } from './enums';
import { toAccountId, toFolderId, toMessageId } from './ids';
import type { MailMessage } from './models';
import { applyRules, evaluateRule } from './rules';
import type { Rule } from './rules';

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: toMessageId('m1'),
    accountId: toAccountId('acc-1'),
    folderId: toFolderId('inbox'),
    subject: 'Newsletter Juni',
    from: { address: 'news@shop.example.com', displayName: 'Shop News' },
    recipients: [{ kind: 'to', address: { address: 'me@example.com' } }],
    receivedAt: 0,
    importance: Importance.Normal,
    flags: [],
    categories: [],
    hasAttachments: false,
    attachments: [],
    preview: '',
    ...overrides,
  };
}

const newsletterRule: Rule = {
  id: 'r1',
  name: 'Newsletter',
  enabled: true,
  match: 'any',
  conditions: [{ type: 'fromContains', value: 'news@' }],
  actions: [{ type: 'markRead' }, { type: 'addCategory', category: 'Newsletter' }],
};

describe('evaluateRule', () => {
  it('match=all verlangt alle Bedingungen', () => {
    const rule: Rule = {
      ...newsletterRule,
      match: 'all',
      conditions: [
        { type: 'fromContains', value: 'news@' },
        { type: 'subjectContains', value: 'Juni' },
      ],
    };
    expect(evaluateRule(message(), rule)).toBe(true);
    expect(evaluateRule(message({ subject: 'Mai' }), rule)).toBe(false);
  });

  it('match=any genügt eine Bedingung', () => {
    const rule: Rule = {
      ...newsletterRule,
      match: 'any',
      conditions: [{ type: 'subjectContains', value: 'xxx' }, { type: 'hasAttachment' }],
    };
    expect(evaluateRule(message({ hasAttachments: true }), rule)).toBe(true);
    expect(evaluateRule(message(), rule)).toBe(false);
  });

  it('deaktivierte Regeln treffen nie zu', () => {
    expect(evaluateRule(message(), { ...newsletterRule, enabled: false })).toBe(false);
  });

  it('Regeln ohne Bedingungen treffen immer zu', () => {
    expect(evaluateRule(message(), { ...newsletterRule, conditions: [] })).toBe(true);
  });

  it('importanceIs vergleicht die Wichtigkeit', () => {
    const rule: Rule = {
      ...newsletterRule,
      conditions: [{ type: 'importanceIs', importance: Importance.High }],
    };
    expect(evaluateRule(message({ importance: Importance.High }), rule)).toBe(true);
    expect(evaluateRule(message(), rule)).toBe(false);
  });

  it('fromContains prüft auch den Anzeigenamen; toContains die Empfänger', () => {
    expect(
      evaluateRule(message(), {
        ...newsletterRule,
        conditions: [{ type: 'fromContains', value: 'shop news' }],
      }),
    ).toBe(true);
    expect(
      evaluateRule(message(), {
        ...newsletterRule,
        conditions: [{ type: 'toContains', value: 'me@example.com' }],
      }),
    ).toBe(true);
  });
});

describe('applyRules', () => {
  it('sammelt Aktionen aller zutreffenden Regeln in Reihenfolge', () => {
    const flagRule: Rule = {
      id: 'r2',
      name: 'Flag',
      enabled: true,
      match: 'all',
      conditions: [],
      actions: [{ type: 'flag' }],
    };
    const actions = applyRules(message(), [newsletterRule, flagRule]);
    expect(actions.map((a) => a.type)).toEqual(['markRead', 'addCategory', 'flag']);
  });

  it('stopProcessing beendet nach der aktuellen Regel', () => {
    const stopRule: Rule = {
      id: 'r-stop',
      name: 'Stop',
      enabled: true,
      match: 'all',
      conditions: [],
      actions: [{ type: 'markRead' }, { type: 'stopProcessing' }],
    };
    const laterRule: Rule = {
      id: 'r-late',
      name: 'Spät',
      enabled: true,
      match: 'all',
      conditions: [],
      actions: [{ type: 'flag' }],
    };
    const actions = applyRules(message(), [stopRule, laterRule]);
    expect(actions.map((a) => a.type)).toEqual(['markRead', 'stopProcessing']);
  });

  it('überspringt nicht zutreffende Regeln', () => {
    const noMatch: Rule = {
      ...newsletterRule,
      conditions: [{ type: 'subjectContains', value: 'gibt-es-nicht' }],
      match: 'all',
    };
    expect(applyRules(message(), [noMatch])).toEqual([]);
  });
});
