import type {
  Account,
  AccountId,
  CalendarEvent,
  Contact,
  FolderId,
  MailFolder,
  MailMessage,
  MessageFlag,
  MessageId,
  OutgoingMessage,
} from '@nexus/domain';
import type {
  AttachmentContent,
  AutodiscoverResult,
  CalendarStore,
  ContactStore,
  Credentials,
  FolderStore,
  MailStore,
  MailTransport,
  OutboxOperation,
  OutboxState,
  PingResult,
  PinningConfig,
  PushTransport,
  SearchHit,
  SecureStore,
  SyncCursorStore,
  SyncDelta,
  TransportCapabilities,
} from '@nexus/core-transport';
import { emptyOutbox } from '@nexus/core-transport';
import { NexusNative } from './NexusNative';

interface PayloadRow {
  readonly payload: string;
  readonly [column: string]: string | number | null;
}

/** Übergibt die Pinning-Policy ans native Modul (TLS-Challenge wertet sie fail-closed aus). */
export async function configurePinning(config: PinningConfig): Promise<void> {
  await NexusNative.transportConfigurePinning(JSON.stringify(config));
}

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
    if (messages.length === 0) return;
    // H7: schlanke Listen-Spalten (from_*, is_read, flagged) mitschreiben, damit `listFolder`
    // ohne JSON-Parsing der Payload auskommt. H8: alle Upserts atomar in EINER Transaktion.
    const statements = messages.map((m) => ({
      sql: `INSERT INTO messages
              (id, account_id, folder_id, received_at, subject, preview,
               from_name, from_address, is_read, flagged, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              folder_id = excluded.folder_id,
              received_at = excluded.received_at,
              subject = excluded.subject,
              preview = excluded.preview,
              from_name = excluded.from_name,
              from_address = excluded.from_address,
              is_read = excluded.is_read,
              flagged = excluded.flagged,
              payload = excluded.payload`,
      params: [
        m.id,
        m.accountId,
        m.folderId,
        m.receivedAt,
        m.subject,
        m.preview,
        m.from.displayName ?? null,
        m.from.address,
        m.flags.includes('read') ? 1 : 0,
        m.flags.includes('flagged') ? 1 : 0,
        JSON.stringify(m),
      ] as (string | number | null)[],
    }));
    await NexusNative.dbExecBatch(JSON.stringify(statements));
  }

  async deleteMessages(accountId: AccountId, messageIds: readonly string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const statements = messageIds.map((id) => ({
      sql: 'DELETE FROM messages WHERE account_id = ? AND id = ?',
      params: [accountId, id] as (string | number | null)[],
    }));
    await NexusNative.dbExecBatch(JSON.stringify(statements));
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
    // H7: NUR die für die Listenzeile nötigen Spalten lesen (kein JSON.parse der vollen Payload
    // mit Body/Anhängen/Empfängern). Die Liste braucht Absender, Betreff, Vorschau, Lese-/Flag-
    // Status. Beim Öffnen lädt `getMessage` die vollständige Nachricht aus `payload` nach.
    const rows = (await NexusNative.dbQuery(
      `SELECT id, account_id, folder_id, received_at, subject, preview,
              from_name, from_address, is_read, flagged
       FROM messages
       WHERE account_id = ? AND folder_id = ?
       ORDER BY received_at DESC LIMIT ? OFFSET ?`,
      [accountId, folderId, limit, offset],
    )) as readonly Record<string, string | number | null>[];
    return rows.map((r) => {
      const fromName =
        typeof r.from_name === 'string' && r.from_name.length > 0 ? r.from_name : undefined;
      const flags: MessageFlag[] = [];
      if (r.is_read) flags.push('read');
      if (r.flagged) flags.push('flagged');
      return {
        id: String(r.id) as MessageId,
        accountId: String(r.account_id) as AccountId,
        folderId: String(r.folder_id) as FolderId,
        subject: typeof r.subject === 'string' ? r.subject : '',
        from: {
          address: typeof r.from_address === 'string' ? r.from_address : '',
          ...(fromName !== undefined ? { displayName: fromName } : {}),
        },
        recipients: [],
        receivedAt: Number(r.received_at),
        importance: 'normal',
        flags,
        categories: [],
        hasAttachments: false,
        attachments: [],
        preview: typeof r.preview === 'string' ? r.preview : '',
      } satisfies MailMessage;
    });
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

/** MailTransport-Port (+ DirectPush) → nativer EWS/EAS-Connector. JSON über die Bridge. */
export class NativeMailTransport implements MailTransport, PushTransport {
  constructor(readonly capabilities: TransportCapabilities) {}

  async ping(
    accountId: AccountId,
    folderIds: readonly FolderId[],
    timeoutMs: number,
  ): Promise<PingResult> {
    const json = await NexusNative.transportPing(
      accountId,
      JSON.stringify(folderIds),
      Math.round(timeoutMs / 1000),
    );
    return JSON.parse(json) as PingResult;
  }

  async discover(email: string, credentials: Credentials): Promise<AutodiscoverResult> {
    const json = await NexusNative.transportDiscover(email, JSON.stringify(credentials));
    return JSON.parse(json) as AutodiscoverResult;
  }

  async verifyCredentials(email: string): Promise<void> {
    // Wirft (Bridge-Reject) bei abgelehnter Anmeldung/Serverfehler — siehe natives post().
    await NexusNative.transportVerify(email);
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

  async loadAccount(accountId: AccountId): Promise<Account> {
    const json = await NexusNative.transportLoadAccount(accountId);
    return JSON.parse(json) as Account;
  }

  async syncFolders(accountId: AccountId, syncKey?: string): Promise<SyncDelta<MailFolder>> {
    const json = await NexusNative.transportSyncFolders(accountId, syncKey ?? null);
    return JSON.parse(json) as SyncDelta<MailFolder>;
  }

  async syncCalendar(accountId: AccountId, syncKey?: string): Promise<SyncDelta<CalendarEvent>> {
    const json = await NexusNative.transportSyncCalendar(accountId, syncKey ?? null);
    return JSON.parse(json) as SyncDelta<CalendarEvent>;
  }

  async syncContacts(accountId: AccountId, syncKey?: string): Promise<SyncDelta<Contact>> {
    const json = await NexusNative.transportSyncContacts(accountId, syncKey ?? null);
    return JSON.parse(json) as SyncDelta<Contact>;
  }

  async getMessage(accountId: AccountId, messageId: MessageId): Promise<MailMessage> {
    const json = await NexusNative.transportGetMessage(accountId, messageId);
    return JSON.parse(json) as MailMessage;
  }

  async getAttachment(accountId: AccountId, attachmentId: string): Promise<AttachmentContent> {
    const json = await NexusNative.transportGetAttachment(accountId, attachmentId);
    return JSON.parse(json) as AttachmentContent;
  }
}

/** FolderStore-Port → verschlüsselte SQLite-Tabelle `folders` (Payload als JSON). */
export class SqlFolderStore implements FolderStore {
  async upsertFolders(folders: readonly MailFolder[]): Promise<void> {
    for (const f of folders) {
      await NexusNative.dbExec(
        `INSERT INTO folders (id, account_id, payload) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
        [f.id, f.accountId, JSON.stringify(f)],
      );
    }
  }
  async deleteFolders(accountId: AccountId, folderIds: readonly string[]): Promise<void> {
    for (const id of folderIds) {
      await NexusNative.dbExec('DELETE FROM folders WHERE account_id = ? AND id = ?', [
        accountId,
        id,
      ]);
    }
  }
  async listFolders(accountId: AccountId): Promise<readonly MailFolder[]> {
    const rows = (await NexusNative.dbQuery('SELECT payload FROM folders WHERE account_id = ?', [
      accountId,
    ])) as readonly PayloadRow[];
    return rows.map((r) => JSON.parse(r.payload) as MailFolder);
  }
}

/** CalendarStore-Port → verschlüsselte SQLite-Tabelle `events`. */
export class SqlCalendarStore implements CalendarStore {
  async upsertEvents(events: readonly CalendarEvent[]): Promise<void> {
    for (const e of events) {
      await NexusNative.dbExec(
        `INSERT INTO events (id, account_id, start_at, end_at, payload) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET start_at=excluded.start_at, end_at=excluded.end_at, payload=excluded.payload`,
        [e.id, e.accountId, e.startAt, e.endAt, JSON.stringify(e)],
      );
    }
  }
  async deleteEvents(accountId: AccountId, eventIds: readonly string[]): Promise<void> {
    for (const id of eventIds) {
      await NexusNative.dbExec('DELETE FROM events WHERE account_id = ? AND id = ?', [
        accountId,
        id,
      ]);
    }
  }
  async listRange(
    accountId: AccountId,
    fromMs: number,
    toMs: number,
  ): Promise<readonly CalendarEvent[]> {
    const rows = (await NexusNative.dbQuery(
      `SELECT payload FROM events WHERE account_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at ASC`,
      [accountId, toMs, fromMs],
    )) as readonly PayloadRow[];
    return rows.map((r) => JSON.parse(r.payload) as CalendarEvent);
  }
}

/** ContactStore-Port → verschlüsselte SQLite-Tabelle `contacts`. */
export class SqlContactStore implements ContactStore {
  async upsertContacts(contacts: readonly Contact[]): Promise<void> {
    for (const c of contacts) {
      await NexusNative.dbExec(
        `INSERT INTO contacts (id, account_id, display_name, email, payload) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, email=excluded.email, payload=excluded.payload`,
        [c.id, c.accountId, c.displayName, c.emailAddresses[0]?.address ?? null, JSON.stringify(c)],
      );
    }
  }
  async deleteContacts(accountId: AccountId, contactIds: readonly string[]): Promise<void> {
    for (const id of contactIds) {
      await NexusNative.dbExec('DELETE FROM contacts WHERE account_id = ? AND id = ?', [
        accountId,
        id,
      ]);
    }
  }
  async search(accountId: AccountId, query: string): Promise<readonly Contact[]> {
    const like = `%${query}%`;
    const rows = (await NexusNative.dbQuery(
      `SELECT payload FROM contacts WHERE account_id = ? AND (display_name LIKE ? OR email LIKE ?)`,
      [accountId, like, like],
    )) as readonly PayloadRow[];
    return rows.map((r) => JSON.parse(r.payload) as Contact);
  }
}

/** SyncCursorStore-Port → verschlüsselte SQLite-Tabelle `sync_cursors` (echtes Delta-Sync). */
export class SqlSyncCursorStore implements SyncCursorStore {
  async getCursor(key: string): Promise<string | undefined> {
    const rows = (await NexusNative.dbQuery(
      'SELECT cursor FROM sync_cursors WHERE key = ? LIMIT 1',
      [key],
    )) as readonly { readonly cursor?: string | number | null }[];
    const c = rows[0]?.cursor;
    return typeof c === 'string' ? c : undefined;
  }
  async setCursor(key: string, cursor: string): Promise<void> {
    await NexusNative.dbExec(
      `INSERT INTO sync_cursors (key, cursor) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET cursor = excluded.cursor`,
      [key, cursor],
    );
  }
  async clear(accountId: AccountId): Promise<void> {
    await NexusNative.dbExec('DELETE FROM sync_cursors WHERE key LIKE ?', [`${accountId}:%`]);
  }
}
