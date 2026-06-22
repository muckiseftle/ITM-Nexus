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
import { toMessageId } from '@nexus/domain';
import type {
  AutodiscoverResult,
  Credentials,
  MailTransport,
  OutboxOperation,
  SearchHit,
  SyncDelta,
  TransportCapabilities,
} from '@nexus/core-transport';

const DEMO_CAPABILITIES: TransportCapabilities = {
  ews: true,
  activeSync: true,
  directPush: true,
  publicFolders: true,
  delegation: true,
  serverSearch: false,
};

function emptyDelta<T>(): SyncDelta<T> {
  return { syncKey: 'demo', created: [], updated: [], deletedIds: [], hasMore: false };
}

/**
 * Öffentlicher In-Memory-{@link MailTransport} für den Demo-/Offline-Modus (siehe
 * `createInMemoryContainer`). Anders als das Test-Fake ist diese Klasse Teil der
 * öffentlichen API. Sie führt keine echte Server-Kommunikation: Sync liefert leere Deltas
 * (die Demo-Daten werden direkt in den Store geseedet), Operationen werden no-op bestätigt.
 */
export class InMemoryMailTransport implements MailTransport {
  readonly capabilities: TransportCapabilities = DEMO_CAPABILITIES;

  private sentCounter = 0;

  discover(email: string, _credentials: Credentials): Promise<AutodiscoverResult> {
    return Promise.resolve({
      emailAddress: email,
      capabilities: this.capabilities,
      auth: 'basic',
    });
  }

  loadAccount(accountId: AccountId): Promise<Account> {
    return Promise.resolve({
      id: accountId,
      emailAddress: 'demo@nexus.local',
      displayName: 'NEXUS Demo',
      serverHost: 'demo.nexus.local',
    });
  }

  syncFolders(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<MailFolder>> {
    return Promise.resolve(emptyDelta<MailFolder>());
  }
  syncMessages(
    _accountId: AccountId,
    _folderId: FolderId,
    _syncKey?: string,
  ): Promise<SyncDelta<MailMessage>> {
    return Promise.resolve(emptyDelta<MailMessage>());
  }
  syncCalendar(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<CalendarEvent>> {
    return Promise.resolve(emptyDelta<CalendarEvent>());
  }
  syncContacts(_accountId: AccountId, _syncKey?: string): Promise<SyncDelta<Contact>> {
    return Promise.resolve(emptyDelta<Contact>());
  }

  getMessage(_accountId: AccountId, _messageId: MessageId): Promise<MailMessage> {
    return Promise.reject(
      new Error('InMemoryMailTransport.getMessage: im Demo-Modus nicht genutzt.'),
    );
  }

  applyOperation(_operation: OutboxOperation): Promise<void> {
    return Promise.resolve();
  }

  sendMessage(_accountId: AccountId, _message: OutgoingMessage): Promise<MessageId> {
    this.sentCounter += 1;
    return Promise.resolve(toMessageId(`demo-sent-${String(this.sentCounter)}`));
  }

  searchServer(_accountId: AccountId, _query: string): Promise<readonly SearchHit[]> {
    return Promise.resolve([]);
  }
}
