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
  OutboxProcessor,
  RuleProcessor,
  SearchService,
  SyncService,
} from '@nexus/services';
import { toFolderId, type AccountId } from '@nexus/domain';
import { NexusNative } from '../native/NexusNative';
import {
  configurePinning,
  NativeMailTransport,
  NativeSecureStore,
  SqlCalendarStore,
  SqlContactStore,
  SqlFolderStore,
  SqlMailStore,
  SqlSyncCursorStore,
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
  readonly folders: FolderSyncService;
  readonly backgroundSync: BackgroundSyncService;
  /** DirectPush (Long-Poll). Nur im Live-Modus verfügbar (nativer Connector). */
  readonly push?: PushTransport;
  /** Plant den nativen iOS-Hintergrund-Sync (BGTaskScheduler). Nur Live-Modus. */
  readonly scheduleBackgroundSync?: () => Promise<void>;
  /**
   * Stellt eine bestehende Sitzung aus dem Keychain wieder her (kein Netz, keine
   * Anmeldeprüfung — Offline-First). Liefert die accountId (E-Mail) oder null. Nur Live-Modus.
   */
  readonly restoreSession?: () => Promise<string | null>;
  /**
   * Lädt einen Anhang, dekodiert ihn nativ in eine Datei und öffnet das System-Teilen-Blatt
   * (kein Base64 im JS-Heap, H9). Nur Live-Modus — im Demo-Modus fällt die UI auf eine Meldung
   * zurück.
   */
  readonly openAttachment?: (accountId: AccountId, attachmentId: string) => Promise<void>;
  /**
   * Leert den lokalen Daten-Cache (verschlüsselte DB) und baut ihn leer neu auf. Zugangsdaten
   * und DB-Schlüssel bleiben erhalten — der Sync füllt die Daten danach erneut. Nur Live-Modus.
   */
  readonly clearCache?: () => Promise<void>;
  /**
   * Aktueller Verbindungstyp ('wifi' | 'cellular' | 'none') für die Einstellung „Nur über
   * WLAN". Nur Live-Modus — im Demo-Modus undefiniert (Sync läuft dort uneingeschränkt).
   */
  readonly networkStatus?: () => Promise<string>;
  /**
   * Aktives Konto umschalten (Multi-Account): setzt den Zeiger und lädt die Transport-
   * Zugangsdaten des Zielkontos aus dem Keychain neu. Nur Live-Modus.
   */
  readonly switchAccount?: (email: string) => Promise<void>;
  /**
   * Löscht alle lokalen Daten EINES Kontos (Mails/Ordner/Termine/Kontakte/Outbox/Cursor) aus
   * der verschlüsselten DB — andere Konten bleiben unberührt. Nur Live-Modus.
   */
  readonly purgeAccount?: (accountId: AccountId) => Promise<void>;
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
  // Ordner/Kalender/Kontakte liegen jetzt ebenfalls in der verschlüsselten SQLCipher-DB.
  const folderStore = new SqlFolderStore();
  const calendarStore = new SqlCalendarStore();
  const contactStore = new SqlContactStore();
  const cursors = new SqlSyncCursorStore();
  const transport = new NativeMailTransport(DEFAULT_CAPABILITIES);

  const outbox = new OutboxProcessor(transport, mailStore, systemClock);
  const sync = new SyncService(transport, mailStore);
  const folders = new FolderSyncService(transport, folderStore);
  const calendar = new CalendarService(transport, calendarStore);
  const contacts = new ContactsService(transport, contactStore);
  const setup = new AccountSetupService(transport, secureStore);

  return {
    secureStore,
    mailStore,
    calendarStore,
    contactStore,
    transport,
    setup,
    sync,
    outbox,
    search: new SearchService(mailStore, transport),
    compose: new ComposeService(outbox, systemClock),
    rules: new RuleProcessor(mailStore, outbox, systemClock),
    calendar,
    contacts,
    folders,
    backgroundSync: new BackgroundSyncService(
      sync,
      folders,
      calendar,
      contacts,
      outbox,
      systemClock,
      defaultSyncTargets(),
      cursors,
    ),
    push: transport,
    scheduleBackgroundSync: async () => {
      await NexusNative.transportScheduleBackgroundSync();
    },
    restoreSession: () => NexusNative.transportRestore(),
    openAttachment: (accountId, attachmentId) =>
      NexusNative.transportPresentAttachment(accountId, attachmentId),
    clearCache: async () => {
      await NexusNative.dbReset();
      await NexusNative.dbInit();
    },
    networkStatus: () => NexusNative.networkStatus(),
    switchAccount: async (email) => {
      // Zeiger setzen, dann die Zugangsdaten des Zielkontos in den Transport laden (Keychain).
      await setup.activate(email);
      await NexusNative.transportRestore();
    },
    purgeAccount: async (accountId) => {
      // Inhalts-Tabellen pro Konto leeren (Master-Key bleibt — andere Konten unberührt).
      for (const table of ['messages', 'folders', 'events', 'contacts', 'outbox']) {
        await NexusNative.dbExec(`DELETE FROM ${table} WHERE account_id = ?`, [accountId]);
      }
      await NexusNative.dbExec('DELETE FROM sync_cursors WHERE key LIKE ?', [`${accountId}:%`]);
    },
  };
}

export { defaultSyncTargets };
