import type {
  Account,
  AccountId,
  CalendarEvent,
  Contact,
  FolderId,
  MailFolder,
  MailMessage,
  MessageId,
  OutgoingMessage,
} from '@nexus/domain';
import type {
  AutodiscoverResult,
  Credentials,
  MailStore,
  MailTransport,
  OutboxOperation,
  OutboxState,
  SearchHit,
  SecureStore,
  SyncDelta,
  TransportCapabilities,
} from '@nexus/core-transport';
import { emptyOutbox } from '@nexus/core-transport';
import { NexusNative } from './NexusNative';

/** SecureStore-Port → Keychain/Keystore (natives Modul). */
export class NativeSecureStore implements SecureStore {
  async set(key: string, value: string): Promise<void> {
    await NexusNative.secureSet(key, value);
  }
  async get(key: string): Promise<string | undefined> {
    return (await NexusNative.secureGet(key)) ?? undefined;
  }
  async delete(key: string): Promise<void> {
    await NexusNative.secureDelete(key);
  }
  async wipe(): Promise<void> {
    await NexusNative.secureWipe();
  }
}

interface MessageRow {
  readonly payload: string;
  readonly [column: string]: string | number | null;
}

/**
 * MailStore-Port → verschlüsselte SQLite-DB (SQLCipher) über die DB-Primitive des nativen
 * Moduls. Die Nachrichten-Payload wird als JSON in der Spalte `payload` gehalten; indexierte
 * Spalten (account_id, folder_id, received_at) ermöglichen Filter/Sortierung/Suche.
 */
export class SqlMailStore implements MailStore {
  async upsertMessages(messages: readonly MailMessage[]): Promise<void> {
    for (const m of messages) {
      await NexusNative.dbExec(
        `INSERT INTO messages (id, account_id, folder_id, received_at, subject, preview, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           folder_id = excluded.folder_id,
           received_at = excluded.received_at,
           subject = excluded.subject,
           preview = excluded.preview,
           payload = excluded.payload`,
        [m.id, m.accountId, m.folderId, m.receivedAt, m.subject, m.preview, JSON.stringify(m)],
      );
    }
  }

  async deleteMessages(accountId: AccountId, messageIds: readonly string[]): Promise<void> {
    for (const id of messageIds) {
      await NexusNative.dbExec('DELETE FROM messages WHERE account_id = ? AND id = ?', [
        accountId,
        id,
      ]);
    }
  }

  async getMessage(accountId: AccountId, messageId: MessageId): Promise<MailMessage | undefined> {
    const rows = (await NexusNative.dbQuery(
      'SELECT payload FROM messages WHERE account_id = ? AND id = ? LIMIT 1',
      [accountId, messageId],
    )) as readonly MessageRow[];
    const row = rows[0];
    return row === undefined ? undefined : (JSON.parse(row.payload) as MailMessage);
  }

  async listFolder(
    accountId: AccountId,
    folderId: FolderId,
    limit: number,
    offset: number,
  ): Promise<readonly MailMessage[]> {
    const rows = (await NexusNative.dbQuery(
      `SELECT payload FROM messages
       WHERE account_id = ? AND folder_id = ?
       ORDER BY received_at DESC LIMIT ? OFFSET ?`,
      [accountId, folderId, limit, offset],
    )) as readonly MessageRow[];
    return rows.map((r) => JSON.parse(r.payload) as MailMessage);
  }

  async searchLocal(accountId: AccountId, query: string): Promise<readonly SearchHit[]> {
    // Nutzt den FTS5-Index (siehe natives DB-Schema); Rang aus FTS, Quelle 'local'.
    const rows = await NexusNative.dbQuery(
      `SELECT m.id AS id, m.received_at AS rank
       FROM messages_fts f JOIN messages m ON m.rowid = f.rowid
       WHERE m.account_id = ? AND messages_fts MATCH ?
       ORDER BY rank DESC`,
      [accountId, query],
    );
    return rows.map((r) => ({
      messageId: String(r.id) as MessageId,
      rank: Number(r.rank),
      source: 'local' as const,
    }));
  }

  async loadOutbox(accountId: AccountId): Promise<OutboxState> {
    const rows = (await NexusNative.dbQuery(
      'SELECT payload FROM outbox WHERE account_id = ? LIMIT 1',
      [accountId],
    )) as readonly MessageRow[];
    const row = rows[0];
    return row === undefined ? emptyOutbox() : (JSON.parse(row.payload) as OutboxState);
  }

  async saveOutbox(accountId: AccountId, state: OutboxState): Promise<void> {
    await NexusNative.dbExec(
      `INSERT INTO outbox (account_id, payload) VALUES (?, ?)
       ON CONFLICT(account_id) DO UPDATE SET payload = excluded.payload`,
      [accountId, JSON.stringify(state)],
    );
  }
}

/** MailTransport-Port → nativer EWS/EAS-Connector. JSON über die Bridge. */
export class NativeMailTransport implements MailTransport {
  constructor(readonly capabilities: TransportCapabilities) {}

  async discover(email: string, credentials: Credentials): Promise<AutodiscoverResult> {
    const json = await NexusNative.transportDiscover(email, JSON.stringify(credentials));
    return JSON.parse(json) as AutodiscoverResult;
  }

  async syncMessages(
    accountId: AccountId,
    folderId: FolderId,
    syncKey?: string,
  ): Promise<SyncDelta<MailMessage>> {
    const json = await NexusNative.transportSyncMessages(accountId, folderId, syncKey ?? null);
    return JSON.parse(json) as SyncDelta<MailMessage>;
  }

  async applyOperation(operation: OutboxOperation): Promise<void> {
    await NexusNative.transportApplyOperation(JSON.stringify(operation));
  }

  async sendMessage(accountId: AccountId, message: OutgoingMessage): Promise<MessageId> {
    const json = await NexusNative.transportSendMessage(accountId, JSON.stringify(message));
    return JSON.parse(json) as MessageId;
  }

  async searchServer(accountId: AccountId, query: string): Promise<readonly SearchHit[]> {
    const json = await NexusNative.transportSearchServer(accountId, query);
    return JSON.parse(json) as readonly SearchHit[];
  }

  // Folgende Methoden gehören zum Vertrag, sind im nativen Connector aber noch nicht
  // verdrahtet (iterativ, siehe docs/11-Native-und-App.md). Sie folgen demselben
  // JSON-über-Bridge-Muster wie die obigen.
  loadAccount(_accountId: AccountId): Promise<Account> {
    return Promise.reject(new Error('NativeMailTransport.loadAccount: noch nicht verdrahtet.'));
  }
  syncFolders(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<MailFolder>> {
    return Promise.reject(new Error('NativeMailTransport.syncFolders: noch nicht verdrahtet.'));
  }
  syncCalendar(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<CalendarEvent>> {
    return Promise.reject(new Error('NativeMailTransport.syncCalendar: noch nicht verdrahtet.'));
  }
  syncContacts(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<Contact>> {
    return Promise.reject(new Error('NativeMailTransport.syncContacts: noch nicht verdrahtet.'));
  }
  getMessage(_accountId: AccountId, _messageId: MessageId): Promise<MailMessage> {
    return Promise.reject(new Error('NativeMailTransport.getMessage: noch nicht verdrahtet.'));
  }
}
