import type {
  AccountId,
  CalendarEvent,
  Contact,
  FolderId,
  MailFolder,
  MailMessage,
  MessageId,
} from '@nexus/domain';
import type {
  CalendarStore,
  ContactStore,
  FolderStore,
  MailStore,
  OutboxState,
  SearchHit,
  SecureStore,
  SyncCursorStore,
} from '@nexus/core-transport';
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

/** In-Memory-{@link CalendarStore} (Referenz/Test-Double). Produktiv: SQLCipher. */
export class InMemoryCalendarStore implements CalendarStore {
  private readonly events = new Map<string, CalendarEvent>();

  private static key(accountId: AccountId, eventId: string): string {
    return `${accountId}::${eventId}`;
  }

  upsertEvents(events: readonly CalendarEvent[]): Promise<void> {
    for (const event of events) {
      this.events.set(InMemoryCalendarStore.key(event.accountId, event.id), event);
    }
    return Promise.resolve();
  }

  deleteEvents(accountId: AccountId, eventIds: readonly string[]): Promise<void> {
    for (const id of eventIds) {
      this.events.delete(InMemoryCalendarStore.key(accountId, id));
    }
    return Promise.resolve();
  }

  listRange(accountId: AccountId, fromMs: number, toMs: number): Promise<readonly CalendarEvent[]> {
    const inRange = [...this.events.values()]
      .filter((e) => e.accountId === accountId && e.startAt < toMs && e.endAt > fromMs)
      .sort((a, b) => a.startAt - b.startAt);
    return Promise.resolve(inRange);
  }
}

/** In-Memory-{@link ContactStore} (Referenz/Test-Double). Produktiv: SQLCipher. */
export class InMemoryContactStore implements ContactStore {
  private readonly contacts = new Map<string, Contact>();

  private static key(accountId: AccountId, contactId: string): string {
    return `${accountId}::${contactId}`;
  }

  upsertContacts(contacts: readonly Contact[]): Promise<void> {
    for (const contact of contacts) {
      this.contacts.set(InMemoryContactStore.key(contact.accountId, contact.id), contact);
    }
    return Promise.resolve();
  }

  deleteContacts(accountId: AccountId, contactIds: readonly string[]): Promise<void> {
    for (const id of contactIds) {
      this.contacts.delete(InMemoryContactStore.key(accountId, id));
    }
    return Promise.resolve();
  }

  search(accountId: AccountId, query: string): Promise<readonly Contact[]> {
    const needle = query.toLowerCase();
    const matches = [...this.contacts.values()].filter(
      (c) =>
        c.accountId === accountId &&
        (c.displayName.toLowerCase().includes(needle) ||
          c.emailAddresses.some((a) => a.address.toLowerCase().includes(needle))),
    );
    return Promise.resolve(matches);
  }
}

/** In-Memory-{@link FolderStore} (Referenz/Test-Double). Produktiv: SQLCipher. */
export class InMemoryFolderStore implements FolderStore {
  private readonly folders = new Map<string, MailFolder>();

  private static key(accountId: AccountId, folderId: string): string {
    return `${accountId}::${folderId}`;
  }

  upsertFolders(folders: readonly MailFolder[]): Promise<void> {
    for (const folder of folders) {
      this.folders.set(InMemoryFolderStore.key(folder.accountId, folder.id), folder);
    }
    return Promise.resolve();
  }

  deleteFolders(accountId: AccountId, folderIds: readonly string[]): Promise<void> {
    for (const id of folderIds) {
      this.folders.delete(InMemoryFolderStore.key(accountId, id));
    }
    return Promise.resolve();
  }

  listFolders(accountId: AccountId): Promise<readonly MailFolder[]> {
    const own = [...this.folders.values()].filter((f) => f.accountId === accountId);
    return Promise.resolve(own);
  }
}

/** In-Memory-{@link SyncCursorStore} (Referenz/Test-Double). Produktiv: SQLCipher. */
export class InMemorySyncCursorStore implements SyncCursorStore {
  private readonly cursors = new Map<string, string>();

  getCursor(key: string): Promise<string | undefined> {
    return Promise.resolve(this.cursors.get(key));
  }
  setCursor(key: string, cursor: string): Promise<void> {
    this.cursors.set(key, cursor);
    return Promise.resolve();
  }
  clear(accountId: AccountId): Promise<void> {
    for (const k of [...this.cursors.keys()]) {
      if (k.startsWith(`${accountId}:`)) this.cursors.delete(k);
    }
    return Promise.resolve();
  }
}
