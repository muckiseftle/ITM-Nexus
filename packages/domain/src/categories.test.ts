import { describe, expect, it } from 'vitest';
import { hasCategory, withCategory, withoutCategory } from './categories';
import { toAccountId, toFolderId, toMessageId } from './ids';
import type { MailMessage } from './models';

function message(categories: string[]): MailMessage {
  return {
    id: toMessageId('m1'),
    accountId: toAccountId('acc-1'),
    folderId: toFolderId('inbox'),
    subject: 'Test',
    from: { address: 'a@example.com' },
    recipients: [],
    receivedAt: 0,
    importance: 'normal',
    flags: [],
    categories,
    hasAttachments: false,
    attachments: [],
    preview: '',
  };
}

describe('categories', () => {
  it('hasCategory erkennt vorhandene Kategorien', () => {
    expect(hasCategory(message(['Wichtig']), 'Wichtig')).toBe(true);
    expect(hasCategory(message([]), 'Wichtig')).toBe(false);
  });

  it('withCategory fügt idempotent hinzu', () => {
    const m = message([]);
    const tagged = withCategory(m, 'Projekt');
    expect(tagged.categories).toEqual(['Projekt']);
    expect(withCategory(tagged, 'Projekt')).toBe(tagged);
  });

  it('withoutCategory entfernt idempotent', () => {
    const m = message(['Projekt', 'Wichtig']);
    expect(withoutCategory(m, 'Projekt').categories).toEqual(['Wichtig']);
    const clean = message([]);
    expect(withoutCategory(clean, 'Projekt')).toBe(clean);
  });
});
