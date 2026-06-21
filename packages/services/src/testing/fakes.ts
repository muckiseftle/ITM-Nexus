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
import { FolderType, toContactId, toEventId, toFolderId, toMessageId } from '@nexus/domain';
import type {
  AutodiscoverResult,
  Clock,
  Credentials,
  MailTransport,
  OutboxOperation,
  SearchHit,
  SyncDelta,
  TransportCapabilities,
} from '@nexus/core-transport';
import { NetworkError } from '@nexus/core-transport';

const DEFAULT_CAPABILITIES: TransportCapabilities = {
  ews: true,
  activeSync: true,
  directPush: true,
  publicFolders: true,
  delegation: true,
  serverSearch: true,
};

export interface FakeTransportConfig {
  readonly capabilities?: TransportCapabilities;
  readonly discoverResult?: AutodiscoverResult;
  readonly messageDelta?: SyncDelta<MailMessage>;
  readonly folderDelta?: SyncDelta<MailFolder>;
  readonly calendarDelta?: SyncDelta<CalendarEvent>;
  readonly contactDelta?: SyncDelta<Contact>;
  readonly serverHits?: readonly SearchHit[];
  /** Lässt die ersten N `applyOperation`-Aufrufe fehlschlagen (Retry-Tests). */
  readonly failApplyTimes?: number;
  /** Lässt `searchServer` werfen (Degradations-Tests). */
  readonly failServerSearch?: boolean;
}

function emptyDelta<T>(): SyncDelta<T> {
  return { syncKey: 'sk-0', created: [], updated: [], deletedIds: [], hasMore: false };
}

/** Konfigurierbarer In-Memory-{@link MailTransport} für deterministische Service-Tests. */
export class FakeMailTransport implements MailTransport {
  readonly capabilities: TransportCapabilities;
  readonly appliedOps: OutboxOperation[] = [];
  applyCallCount = 0;

  constructor(private readonly config: FakeTransportConfig = {}) {
    this.capabilities = config.capabilities ?? DEFAULT_CAPABILITIES;
  }

  discover(email: string, _credentials: Credentials): Promise<AutodiscoverResult> {
    const result: AutodiscoverResult = this.config.discoverResult ?? {
      emailAddress: email,
      capabilities: this.capabilities,
      auth: 'ntlm',
      ewsUrl: 'https://mail.example.com/EWS/Exchange.asmx',
    };
    return Promise.resolve(result);
  }

  syncMessages(
    _accountId: AccountId,
    _folderId: FolderId,
    _syncKey?: string,
  ): Promise<SyncDelta<MailMessage>> {
    const delta: SyncDelta<MailMessage> = this.config.messageDelta ?? {
      syncKey: 'sk-0',
      created: [],
      updated: [],
      deletedIds: [],
      hasMore: false,
    };
    return Promise.resolve(delta);
  }

  applyOperation(operation: OutboxOperation): Promise<void> {
    this.applyCallCount += 1;
    if (this.applyCallCount <= (this.config.failApplyTimes ?? 0)) {
      return Promise.reject(
        new NetworkError(`Versuch ${String(this.applyCallCount)} fehlgeschlagen`),
      );
    }
    this.appliedOps.push(operation);
    return Promise.resolve();
  }

  searchServer(_accountId: AccountId, _query: string): Promise<readonly SearchHit[]> {
    if (this.config.failServerSearch === true) {
      return Promise.reject(new NetworkError('Serversuche nicht verfügbar'));
    }
    return Promise.resolve(this.config.serverHits ?? []);
  }

  // Für die aktuellen Tests nicht benötigte Methoden — bewusst nicht konfiguriert.
  loadAccount(_accountId: AccountId): Promise<Account> {
    return Promise.reject(new Error('FakeMailTransport: loadAccount nicht konfiguriert'));
  }
  syncFolders(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<MailFolder>> {
    return Promise.resolve(this.config.folderDelta ?? emptyDelta<MailFolder>());
  }
  syncCalendar(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<CalendarEvent>> {
    return Promise.resolve(this.config.calendarDelta ?? emptyDelta<CalendarEvent>());
  }
  syncContacts(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<Contact>> {
    return Promise.resolve(this.config.contactDelta ?? emptyDelta<Contact>());
  }
  getMessage(_accountId: AccountId, _messageId: MessageId): Promise<MailMessage> {
    return Promise.reject(new Error('FakeMailTransport: getMessage nicht konfiguriert'));
  }
  sendMessage(_accountId: AccountId, _message: OutgoingMessage): Promise<MessageId> {
    return Promise.resolve(toMessageId('sent-1'));
  }
}

/** Baut eine vollständige {@link MailMessage} mit sinnvollen Defaults für Tests. */
export function makeMessage(params: {
  readonly id: string;
  readonly accountId: AccountId;
  readonly folderId: FolderId;
  readonly subject?: string;
  readonly preview?: string;
  readonly receivedAt?: number;
}): MailMessage {
  return {
    id: toMessageId(params.id),
    accountId: params.accountId,
    folderId: params.folderId,
    subject: params.subject ?? 'Betreff',
    from: { address: 'absender@example.com' },
    recipients: [],
    receivedAt: params.receivedAt ?? 0,
    importance: 'normal',
    flags: [],
    categories: [],
    hasAttachments: false,
    attachments: [],
    preview: params.preview ?? '',
  };
}

/** Baut einen {@link MailFolder} mit Defaults für Tests. */
export function makeFolder(params: {
  readonly id: string;
  readonly accountId: AccountId;
  readonly displayName: string;
  readonly type?: FolderType;
  readonly parentId?: string;
}): MailFolder {
  return {
    id: toFolderId(params.id),
    accountId: params.accountId,
    displayName: params.displayName,
    type: params.type ?? FolderType.Custom,
    ...(params.parentId !== undefined ? { parentId: toFolderId(params.parentId) } : {}),
    unreadCount: 0,
    totalCount: 0,
  };
}

/** Baut einen {@link CalendarEvent} mit Defaults für Tests. */
export function makeEvent(params: {
  readonly id: string;
  readonly accountId: AccountId;
  readonly subject?: string;
  readonly startAt: number;
  readonly endAt: number;
}): CalendarEvent {
  return {
    id: toEventId(params.id),
    accountId: params.accountId,
    subject: params.subject ?? 'Termin',
    startAt: params.startAt,
    endAt: params.endAt,
    isAllDay: false,
    organizer: { address: 'organizer@example.com' },
    attendees: [],
  };
}

/** Baut einen {@link Contact} mit Defaults für Tests. */
export function makeContact(params: {
  readonly id: string;
  readonly accountId: AccountId;
  readonly displayName: string;
  readonly email?: string;
}): Contact {
  return {
    id: toContactId(params.id),
    accountId: params.accountId,
    displayName: params.displayName,
    emailAddresses: params.email !== undefined ? [{ address: params.email }] : [],
  };
}

/** Deterministische, manuell steuerbare Zeitquelle. */
export class ManualClock implements Clock {
  constructor(private current = 0) {}
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
  set(ms: number): void {
    this.current = ms;
  }
}
