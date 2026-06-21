import { describe, expect, it } from 'vitest';
import { MessageFlag } from './enums';
import { hasFlag, isUnread, markRead, withFlag, withoutFlag } from './message-ops';
import type { MailMessage } from './models';
import { toAccountId, toFolderId, toMessageId } from './ids';

function message(flags: MessageFlag[]): MailMessage {
  return {
    id: toMessageId('m1'),
    accountId: toAccountId('acc-1'),
    folderId: toFolderId('inbox'),
    subject: 'Test',
    from: { address: 'a@example.com' },
    recipients: [],
    receivedAt: 0,
    importance: 'normal',
    flags,
    hasAttachments: false,
    attachments: [],
    preview: '',
  };
}

describe('message-ops', () => {
  it('erkennt gesetzte Flags und Ungelesen-Status', () => {
    expect(isUnread(message([]))).toBe(true);
    expect(isUnread(message([MessageFlag.Read]))).toBe(false);
    expect(hasFlag(message([MessageFlag.Flagged]), MessageFlag.Flagged)).toBe(true);
  });

  it('withFlag fügt idempotent hinzu', () => {
    const m = message([]);
    const flagged = withFlag(m, MessageFlag.Flagged);
    expect(flagged.flags).toContain(MessageFlag.Flagged);
    // idempotent: identische Referenz zurück
    expect(withFlag(flagged, MessageFlag.Flagged)).toBe(flagged);
  });

  it('withoutFlag entfernt idempotent', () => {
    const m = message([MessageFlag.Flagged]);
    expect(withoutFlag(m, MessageFlag.Flagged).flags).not.toContain(MessageFlag.Flagged);
    const clean = message([]);
    expect(withoutFlag(clean, MessageFlag.Flagged)).toBe(clean);
  });

  it('markRead setzt und entfernt das Gelesen-Flag', () => {
    const unread = message([]);
    expect(isUnread(markRead(unread, true))).toBe(false);
    expect(isUnread(markRead(message([MessageFlag.Read]), false))).toBe(true);
  });
});
