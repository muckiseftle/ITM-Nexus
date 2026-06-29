import type {
  CalendarStore,
  Clock,
  ContactStore,
  MailStore,
  MailTransport,
  PushTransport,
  SecureStore,
  SyncCursorStore,
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
import {
  toContactId,
  toFolderId,
  type AccountId,
  type Contact,
  type MailMessage,
  type OutgoingAttachment,
  type OutgoingMessage,
} from '@nexus/domain';
import { NexusNative } from '../native/NexusNative';
import {
  addSharedMailbox,
  listSharedMailboxes,
  loadSharedInbox,
  removeSharedMailbox,
  type SharedMailbox,
} from './sharedMailboxes';
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
/** Eine zwischengespeicherte Datenart mit Anzahl und ungefährer Inhaltsgröße (Bytes). */
export interface CacheCategory {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly bytes: number;
}

/** Übersicht über den lokalen Cache: je Datenart Anzahl/Größe + Gesamtsummen. */
export interface CacheStats {
  readonly categories: readonly CacheCategory[];
  readonly totalItems: number;
  readonly totalBytes: number;
}

export interface AppContainer {
  readonly secureStore: SecureStore;
  readonly mailStore: MailStore;
  readonly calendarStore: CalendarStore;
  readonly contactStore: ContactStore;
  readonly transport: MailTransport;
  readonly setup: AccountSetupService;
  readonly sync: SyncService;
  /** Persistente Sync-Cursor (für delta-bewusstes Pull-to-Refresh). */
  readonly cursors: SyncCursorStore;
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
   * Cache-Transparenz: Anzahl + ungefähre Größe der lokal zwischengespeicherten Datenarten
   * (E-Mails/Kalender/Kontakte/Ordner/Ausgang). Größe ist die Summe der Payload-Längen (Inhalt)
   * — eine ehrliche Näherung der DB-Nutzdaten. Nur Live-Modus. Anhänge/Bilder werden NICHT
   * dauerhaft gecacht (bei Bedarf geladen) und daher nicht mitgezählt.
   */
  readonly cacheStats?: () => Promise<CacheStats>;
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
  /**
   * Freigegebene Postfächer (EWS-Delegation). Hinzufügen/Öffnen ist serverseitig
   * berechtigungsgeprüft — ohne Recht wirft `add`/`loadInbox` einen SharedMailboxError
   * ('forbidden'). Nur Live-Modus.
   */
  readonly sharedMailboxes?: {
    readonly list: (account: AccountId) => Promise<readonly SharedMailbox[]>;
    readonly add: (account: AccountId, email: string) => Promise<SharedMailbox>;
    readonly remove: (account: AccountId, email: string) => Promise<void>;
    readonly loadInbox: (account: AccountId, email: string) => Promise<readonly MailMessage[]>;
  };
  /** Öffnet den System-Dateiauswähler für einen Anhang. `null` bei Abbruch. Nur Live-Modus. */
  readonly pickAttachment?: () => Promise<OutgoingAttachment | null>;
  /** Speichert die Nachricht als Entwurf (EWS SaveOnly → „Entwürfe"). Nur Live-Modus. */
  readonly saveDraft?: (account: AccountId, message: OutgoingMessage) => Promise<void>;
  /** Kontakt anlegen (EWS CreateItem) + lokal speichern. Liefert den Kontakt mit Server-Id. */
  readonly createContact?: (account: AccountId, contact: Contact) => Promise<Contact>;
  /** Kontakt aktualisieren (EWS UpdateItem) + lokal aktualisieren. */
  readonly updateContact?: (account: AccountId, contact: Contact) => Promise<void>;
  /** Kontakt löschen (EWS DeleteItem) + lokal entfernen. */
  readonly deleteContact?: (account: AccountId, contactId: string) => Promise<void>;
  /**
   * TOFU-Zertifikat: liest den Server-Fingerprint (SPKI) + Subject, OHNE etwas zu vertrauen.
   * Für die Bestätigung im Setup-Wizard. Nur Live-Modus.
   */
  readonly probeCertificate?: (
    host: string,
  ) => Promise<{ host: string; spkiSha256: string; subject: string }>;
  /** Speichert den vom Nutzer bestätigten SPKI-Pin (fail-closed ab dann). Nur Live-Modus. */
  readonly trustCertificate?: (host: string, spki: string) => Promise<void>;
  /** Zuletzt tatsächlich genutztes Mail-Protokoll des Kontos ('eas' | 'ews' | 'unbekannt'). */
  readonly activeProtocol?: (accountId: AccountId) => Promise<string>;
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
    cursors,
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
    probeCertificate: async (host) =>
      JSON.parse(await NexusNative.transportProbeCertificate(host)) as {
        host: string;
        spkiSha256: string;
        subject: string;
      },
    trustCertificate: (host, spki) => NexusNative.transportTrustCertificate(host, spki),
    activeProtocol: async (accountId) =>
      (JSON.parse(await NexusNative.transportActiveProtocol(accountId)) as { protocol: string })
        .protocol,
    openAttachment: (accountId, attachmentId) =>
      NexusNative.transportPresentAttachment(accountId, attachmentId),
    clearCache: async () => {
      await NexusNative.dbReset();
      await NexusNative.dbInit();
    },
    cacheStats: async () => {
      // Anzahl + Inhaltsgröße (Summe der Payload-Längen) je Tabelle — über das bestehende
      // dbQuery, ohne neue native Methode. LENGTH zählt Zeichen ≈ Bytes der JSON-Payload.
      const tables = [
        { key: 'mails', label: 'E-Mails', table: 'messages' },
        { key: 'events', label: 'Kalender', table: 'events' },
        { key: 'contacts', label: 'Kontakte', table: 'contacts' },
        { key: 'folders', label: 'Ordner', table: 'folders' },
        { key: 'outbox', label: 'Ausgang', table: 'outbox' },
      ] as const;
      const categories: CacheCategory[] = [];
      let totalItems = 0;
      let totalBytes = 0;
      for (const tbl of tables) {
        const rows = await NexusNative.dbQuery(
          `SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(payload)), 0) AS b FROM ${tbl.table}`,
          [],
        );
        const row = rows[0] ?? { n: 0, b: 0 };
        const count = Number(row.n ?? 0);
        const bytes = Number(row.b ?? 0);
        categories.push({ key: tbl.key, label: tbl.label, count, bytes });
        totalItems += count;
        totalBytes += bytes;
      }
      return { categories, totalItems, totalBytes };
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
    sharedMailboxes: {
      list: (account) => listSharedMailboxes(secureStore, account),
      add: (account, email) => addSharedMailbox(secureStore, account, email),
      remove: (account, email) => removeSharedMailbox(secureStore, account, email),
      loadInbox: (account, email) => loadSharedInbox(account, email),
    },
    pickAttachment: async () => {
      try {
        const f = await NexusNative.pickAttachment();
        return {
          name: f.name,
          contentType: f.contentType,
          sizeBytes: f.sizeBytes,
          contentBase64: f.base64,
        };
      } catch {
        // Abbruch ('CANCELLED') oder Lesefehler → kein Anhang.
        return null;
      }
    },
    saveDraft: async (account, message) => {
      await NexusNative.transportSaveDraft(account, JSON.stringify(message));
    },
    createContact: async (account, contact) => {
      const res = JSON.parse(
        await NexusNative.transportCreateContact(account, JSON.stringify(contact)),
      ) as { id?: string };
      const saved: Contact = {
        ...contact,
        id: toContactId(res.id !== undefined && res.id.length > 0 ? res.id : contact.id),
      };
      await contactStore.upsertContacts([saved]);
      return saved;
    },
    updateContact: async (account, contact) => {
      await NexusNative.transportUpdateContact(account, JSON.stringify(contact));
      await contactStore.upsertContacts([contact]);
    },
    deleteContact: async (account, contactId) => {
      await NexusNative.transportDeleteContact(account, contactId);
      await contactStore.deleteContacts(account, [contactId]);
    },
  };
}

export { defaultSyncTargets };
