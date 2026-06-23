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
  AttachmentContent,
  AutodiscoverResult,
  Credentials,
  SyncDelta,
  TransportCapabilities,
} from './dto';
import type { OutboxOperation, OutboxState } from './outbox';
import type { SearchHit } from './search-merge';

/** Injizierbare Zeitquelle — entkoppelt Logik von `Date.now()` (Testbarkeit). */
export interface Clock {
  now(): number;
}

/**
 * Zentrale Transport-Abstraktion (ADR-002). EWS/EAS sind konkrete Implementierungen in den
 * nativen Modulen; obere Schichten kennen ausschließlich dieses Interface. Ein späterer
 * Graph-Connector kann als weitere Implementierung ergänzt werden — ohne Rewrite.
 */
export interface MailTransport {
  readonly capabilities: TransportCapabilities;

  discover(email: string, credentials: Credentials): Promise<AutodiscoverResult>;
  loadAccount(accountId: AccountId): Promise<Account>;

  syncFolders(accountId: AccountId, syncKey?: string): Promise<SyncDelta<MailFolder>>;
  syncMessages(
    accountId: AccountId,
    folderId: FolderId,
    syncKey?: string,
  ): Promise<SyncDelta<MailMessage>>;
  syncCalendar(accountId: AccountId, syncKey?: string): Promise<SyncDelta<CalendarEvent>>;
  syncContacts(accountId: AccountId, syncKey?: string): Promise<SyncDelta<Contact>>;

  getMessage(accountId: AccountId, messageId: MessageId): Promise<MailMessage>;
  sendMessage(accountId: AccountId, message: OutgoingMessage): Promise<MessageId>;

  /** Lädt den Inhalt eines Anhangs (EWS GetAttachment) als Base64. */
  getAttachment(accountId: AccountId, attachmentId: string): Promise<AttachmentContent>;

  /** Führt eine Outbox-Operation gegen den Server aus (idempotent). */
  applyOperation(operation: OutboxOperation): Promise<void>;

  searchServer(accountId: AccountId, query: string): Promise<readonly SearchHit[]>;
}

/**
 * Persistente Sync-Cursor (EWS-SyncState / EAS-SyncKey) je (Konto, Art, Ordner). Ermöglicht
 * echtes inkrementelles Delta-Sync über App-Starts hinweg (statt jedes Mal Vollabgleich).
 * Produktiv: SQLCipher-Tabelle; In-Memory als Referenz/Test-Double.
 */
export interface SyncCursorStore {
  getCursor(key: string): Promise<string | undefined>;
  setCursor(key: string, cursor: string): Promise<void>;
  /** Setzt alle Cursor eines Kontos zurück (erzwingt Voll-Resync). */
  clear(accountId: AccountId): Promise<void>;
}

/** Sicherer Schlüssel/Wert-Speicher (Keychain / Android Keystore). */
export interface SecureStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  /** Krypto-Shredding aller Werte (lokaler/remote Wipe). */
  wipe(): Promise<void>;
}

/** Lokale, verschlüsselte Persistenz (SQLCipher) hinter einem Port. */
export interface MailStore {
  upsertMessages(messages: readonly MailMessage[]): Promise<void>;
  deleteMessages(accountId: AccountId, messageIds: readonly string[]): Promise<void>;
  getMessage(accountId: AccountId, messageId: MessageId): Promise<MailMessage | undefined>;
  listFolder(
    accountId: AccountId,
    folderId: FolderId,
    limit: number,
    offset: number,
  ): Promise<readonly MailMessage[]>;
  searchLocal(accountId: AccountId, query: string): Promise<readonly SearchHit[]>;
  loadOutbox(accountId: AccountId): Promise<OutboxState>;
  saveOutbox(accountId: AccountId, state: OutboxState): Promise<void>;
}

/** Lokale, verschlüsselte Persistenz für Kalendertermine (SQLCipher) hinter einem Port. */
export interface CalendarStore {
  upsertEvents(events: readonly CalendarEvent[]): Promise<void>;
  deleteEvents(accountId: AccountId, eventIds: readonly string[]): Promise<void>;
  /** Termine, die das Fenster `[fromMs, toMs)` schneiden, aufsteigend nach Start. */
  listRange(accountId: AccountId, fromMs: number, toMs: number): Promise<readonly CalendarEvent[]>;
}

/** Lokale, verschlüsselte Persistenz für Kontakte (SQLCipher) hinter einem Port. */
export interface ContactStore {
  upsertContacts(contacts: readonly Contact[]): Promise<void>;
  deleteContacts(accountId: AccountId, contactIds: readonly string[]): Promise<void>;
  search(accountId: AccountId, query: string): Promise<readonly Contact[]>;
}

/** Lokale, verschlüsselte Persistenz für die Ordnerstruktur (SQLCipher) hinter einem Port. */
export interface FolderStore {
  upsertFolders(folders: readonly MailFolder[]): Promise<void>;
  deleteFolders(accountId: AccountId, folderIds: readonly string[]): Promise<void>;
  listFolders(accountId: AccountId): Promise<readonly MailFolder[]>;
}
