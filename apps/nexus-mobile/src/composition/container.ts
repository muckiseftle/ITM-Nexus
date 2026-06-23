import type {
  CalendarStore,
  Clock,
  ContactStore,
  MailStore,
  MailTransport,
  PushTransport,
  SecureStore,
  SyncTarget,
} from '@nexus/core-transport';
import {
  AccountSetupService,
  BackgroundSyncService,
  CalendarService,
  ComposeService,
  ContactsService,
  FolderSyncService,
  InMemoryCalendarStore,
  InMemoryContactStore,
  InMemoryFolderStore,
  OutboxProcessor,
  RuleProcessor,
  SearchService,
  SyncService,
} from '@nexus/services';
import { toFolderId } from '@nexus/domain';
import { NexusNative } from '../native/NexusNative';
import {
  configurePinning,
  NativeMailTransport,
  NativeSecureStore,
  SqlMailStore,
} from '../native/adapters';
import { DEMO_INBOX_ID, PINNING, SYNC_INTERVALS } from '../config';

/**
 * App-Container: das Interface, an dem die UI hängt — port-/service-typisiert, damit sowohl
 * der Live-Container (native Adapter) als auch der Demo-Container (In-Memory) ihn erfüllen.
 */
export interface AppContainer {
  readonly secureStore: SecureStore;
  readonly mailStore: MailStore;
  readonly calendarStore: CalendarStore;
  readonly contactStore: ContactStore;
  readonly transport: MailTransport;
  readonly setup: AccountSetupService;
  readonly sync: SyncService;
  readonly outbox: OutboxProcessor;
  readonly search: SearchService;
  readonly compose: ComposeService;
  readonly rules: RuleProcessor;
  readonly calendar: CalendarService;
  readonly contacts: ContactsService;
  readonly backgroundSync: BackgroundSyncService;
  /** DirectPush (Long-Poll). Nur im Live-Modus verfügbar (nativer Connector). */
  readonly push?: PushTransport;
  /** Plant den nativen iOS-Hintergrund-Sync (BGTaskScheduler). Nur Live-Modus. */
  readonly scheduleBackgroundSync?: () => Promise<void>;
}

const systemClock: Clock = { now: () => Date.now() };

const DEFAULT_CAPABILITIES = {
  ews: true,
  activeSync: true,
  directPush: true,
  publicFolders: true,
  delegation: true,
  serverSearch: true,
} as const;

/** Standard-Sync-Ziele (Posteingang häufig, Struktur/Kalender/Kontakte seltener). */
function defaultSyncTargets(): readonly SyncTarget[] {
  return [
    { kind: 'messages', folderId: toFolderId(DEMO_INBOX_ID), intervalMs: SYNC_INTERVALS.messages },
    { kind: 'folders', intervalMs: SYNC_INTERVALS.folders },
    { kind: 'calendar', intervalMs: SYNC_INTERVALS.calendar },
    { kind: 'contacts', intervalMs: SYNC_INTERVALS.contacts },
  ];
}

/** Live-Container: nutzt die nativen Module (Keychain/Keystore, SQLCipher, EWS/EAS). */
export async function createContainer(): Promise<AppContainer> {
  await NexusNative.dbInit();
  // Certificate-Pinning aktivieren, BEVOR Verbindungen aufgebaut werden (fail-closed).
  await configurePinning(PINNING);

  const secureStore = new NativeSecureStore();
  const mailStore = new SqlMailStore();
  // Ordner/Kalender/Kontakte liegen noch nicht im nativen Store — vorerst In-Memory (Stopgap),
  // bis die native DB sie ebenfalls abbildet.
  const folderStore = new InMemoryFolderStore();
  const calendarStore = new InMemoryCalendarStore();
  const contactStore = new InMemoryContactStore();
  const transport = new NativeMailTransport(DEFAULT_CAPABILITIES);

  const outbox = new OutboxProcessor(transport, mailStore, systemClock);
  const sync = new SyncService(transport, mailStore);
  const folders = new FolderSyncService(transport, folderStore);
  const calendar = new CalendarService(transport, calendarStore);
  const contacts = new ContactsService(transport, contactStore);

  return {
    secureStore,
    mailStore,
    calendarStore,
    contactStore,
    transport,
    setup: new AccountSetupService(transport, secureStore),
    sync,
    outbox,
    search: new SearchService(mailStore, transport),
    compose: new ComposeService(outbox, systemClock),
    rules: new RuleProcessor(mailStore, outbox, systemClock),
    calendar,
    contacts,
    backgroundSync: new BackgroundSyncService(
      sync,
      folders,
      calendar,
      contacts,
      outbox,
      systemClock,
      defaultSyncTargets(),
    ),
    push: transport,
    scheduleBackgroundSync: async () => {
      await NexusNative.transportScheduleBackgroundSync();
    },
  };
}

export { defaultSyncTargets };
