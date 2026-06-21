import { isUnread } from './message-ops';
import type { MailMessage } from './models';

/** Eine Konversation (Thread) aus zusammengehörigen Nachrichten. */
export interface Conversation {
  readonly conversationId: string;
  /** Nachrichten aufsteigend nach Empfangszeit. */
  readonly messages: readonly MailMessage[];
  readonly latestAt: number;
  readonly unreadCount: number;
}

/**
 * Gruppiert Nachrichten zu Konversationen. Schlüssel ist `conversationId` (Fallback: die
 * Nachrichten-ID). Nachrichten werden innerhalb eines Threads aufsteigend, Konversationen
 * absteigend nach jüngster Aktivität sortiert.
 */
export function groupByConversation(messages: readonly MailMessage[]): Conversation[] {
  const groups = new Map<string, MailMessage[]>();
  for (const message of messages) {
    const key = message.conversationId ?? message.id;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [message]);
    } else {
      existing.push(message);
    }
  }

  const conversations: Conversation[] = [];
  for (const [conversationId, msgs] of groups) {
    const sorted = [...msgs].sort((a, b) => a.receivedAt - b.receivedAt);
    const latestAt = sorted.reduce(
      (max, m) => (m.receivedAt > max ? m.receivedAt : max),
      sorted[0]?.receivedAt ?? 0,
    );
    const unreadCount = sorted.filter(isUnread).length;
    conversations.push({ conversationId, messages: sorted, latestAt, unreadCount });
  }

  return conversations.sort((a, b) => b.latestAt - a.latestAt);
}
