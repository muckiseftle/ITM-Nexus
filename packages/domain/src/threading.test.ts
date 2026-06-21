import { describe, expect, it } from 'vitest';
import { MessageFlag } from './enums';
import { toAccountId, toFolderId, toMessageId } from './ids';
import type { MailMessage } from './models';
import { groupByConversation } from './threading';

function message(
  id: string,
  receivedAt: number,
  conversationId?: string,
  flags: MessageFlag[] = [],
): MailMessage {
  return {
    id: toMessageId(id),
    accountId: toAccountId('acc-1'),
    folderId: toFolderId('inbox'),
    ...(conversationId !== undefined ? { conversationId } : {}),
    subject: 'Test',
    from: { address: 'a@example.com' },
    recipients: [],
    receivedAt,
    importance: 'normal',
    flags,
    categories: [],
    hasAttachments: false,
    attachments: [],
    preview: '',
  };
}

describe('groupByConversation', () => {
  it('gruppiert nach conversationId und sortiert intern aufsteigend', () => {
    const convos = groupByConversation([
      message('m1', 300, 'c1'),
      message('m2', 100, 'c1'),
      message('m3', 200, 'c1'),
    ]);
    expect(convos).toHaveLength(1);
    expect(convos[0]?.messages.map((m) => m.id)).toEqual(['m2', 'm3', 'm1']);
    expect(convos[0]?.latestAt).toBe(300);
  });

  it('nutzt die Nachrichten-ID als Fallback ohne conversationId', () => {
    const convos = groupByConversation([message('solo', 50)]);
    expect(convos[0]?.conversationId).toBe('solo');
  });

  it('sortiert Konversationen nach jüngster Aktivität absteigend', () => {
    const convos = groupByConversation([message('a', 100, 'c1'), message('b', 500, 'c2')]);
    expect(convos.map((c) => c.conversationId)).toEqual(['c2', 'c1']);
  });

  it('zählt ungelesene Nachrichten je Konversation', () => {
    const convos = groupByConversation([
      message('m1', 100, 'c1', [MessageFlag.Read]),
      message('m2', 200, 'c1', []),
      message('m3', 300, 'c1', []),
    ]);
    expect(convos[0]?.unreadCount).toBe(2);
  });
});
