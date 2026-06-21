import type { AccountId, FolderId, MailMessage, MessageId } from '@nexus/domain';
import type { MailStore, OutboxState, SearchHit, SecureStore } from '@nexus/core-transport';
import { emptyOutbox } from '@nexus/core-transport';

/**
 * Funktionale In-Memory-Implementierung von {@link MailStore}. Dient als Referenz, für
 * lokale Entwicklung/Demos ohne nativen Store und als Test-Double. Die produktive
 * Implementierung (SQLCipher) liegt später im nativen Modul hinter demselben Port.
 */
export class InMemoryMailStore implements MailStore {
  private readonly messages = new Map<string, MailMessage>();
  private readonly outboxes = new Map<string, OutboxState>();

  private static messageKey(accountId: AccountId, messageId: string): string {
    return `${accountId}::${messageId}`;
  }

  upsertMessages(messages: readonly MailMessage[]): Promise<void> {
    for (const message of messages) {
      this.messages.set(InMemoryMailStore.messageKey(message.accountId, message.id), message);
    }
    return Promise.resolve();
  }

  deleteMessages(accountId: AccountId, messageIds: readonly string[]): Promise<void> {
    for (const id of messageIds) {
      this.messages.delete(InMemoryMailStore.messageKey(accountId, id));
    }
    return Promise.resolve();
  }

  getMessage(accountId: AccountId, messageId: MessageId): Promise<MailMessage | undefined> {
    return Promise.resolve(this.messages.get(InMemoryMailStore.messageKey(accountId, messageId)));
  }

  listFolder(
    accountId: AccountId,
    folderId: FolderId,
    limit: number,
    offset: number,
  ): Promise<readonly MailMessage[]> {
    const all = [...this.messages.values()]
      .filter((m) => m.accountId === accountId && m.folderId === folderId)
      .sort((a, b) => b.receivedAt - a.receivedAt);
    return Promise.resolve(all.slice(offset, offset + limit));
  }

  searchLocal(accountId: AccountId, query: string): Promise<readonly SearchHit[]> {
    const needle = query.toLowerCase();
    const hits = [...this.messages.values()]
      .filter(
        (m) =>
          m.accountId === accountId &&
          (m.subject.toLowerCase().includes(needle) || m.preview.toLowerCase().includes(needle)),
      )
      .map<SearchHit>((m) => ({ messageId: m.id, rank: m.receivedAt, source: 'local' }));
    return Promise.resolve(hits);
  }

  loadOutbox(accountId: AccountId): Promise<OutboxState> {
    return Promise.resolve(this.outboxes.get(accountId) ?? emptyOutbox());
  }

  saveOutbox(accountId: AccountId, state: OutboxState): Promise<void> {
    this.outboxes.set(accountId, state);
    return Promise.resolve();
  }
}

/**
 * In-Memory-{@link SecureStore} (Referenz/Test-Double). Produktiv: Keychain/Keystore.
 * NICHT für echte Secrets in Produktion verwenden.
 */
export class InMemorySecureStore implements SecureStore {
  private readonly values = new Map<string, string>();

  set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.values.get(key));
  }

  delete(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }

  wipe(): Promise<void> {
    this.values.clear();
    return Promise.resolve();
  }
}
