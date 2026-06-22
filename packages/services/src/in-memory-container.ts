import type { Clock } from '@nexus/core-transport';
import { AccountSetupService } from './account-setup-service';
import { CalendarService } from './calendar-service';
import { ComposeService } from './compose-service';
import { ContactsService } from './contacts-service';
import { FolderSyncService } from './folder-sync-service';
import {
  InMemoryCalendarStore,
  InMemoryContactStore,
  InMemoryFolderStore,
  InMemoryMailStore,
  InMemorySecureStore,
} from './in-memory-store';
import { InMemoryMailTransport } from './in-memory-transport';
import { OutboxProcessor } from './outbox-processor';
import { RuleProcessor } from './rule-processor';
import { SearchService } from './search-service';
import { SyncService } from './sync-service';

/** Vollständig verdrahteter Satz aus Stores + Services (port-/service-typisiert). */
export interface ServiceContainer {
  readonly mailStore: InMemoryMailStore;
  readonly folderStore: InMemoryFolderStore;
  readonly contactStore: InMemoryContactStore;
  readonly calendarStore: InMemoryCalendarStore;
  readonly secureStore: InMemorySecureStore;
  readonly transport: InMemoryMailTransport;
  readonly setup: AccountSetupService;
  readonly sync: SyncService;
  readonly folders: FolderSyncService;
  readonly outbox: OutboxProcessor;
  readonly search: SearchService;
  readonly compose: ComposeService;
  readonly contacts: ContactsService;
  readonly calendar: CalendarService;
  readonly rules: RuleProcessor;
}

const systemClock: Clock = { now: () => Date.now() };

/**
 * Verdrahtet alle In-Memory-Adapter mit allen Services. Dient dem Demo-/Offline-Modus der
 * App (sofort lauffähig, ohne Server) und als Referenz-Komposition für Tests/Storybook.
 */
export function createInMemoryContainer(clock: Clock = systemClock): ServiceContainer {
  const mailStore = new InMemoryMailStore();
  const folderStore = new InMemoryFolderStore();
  const contactStore = new InMemoryContactStore();
  const calendarStore = new InMemoryCalendarStore();
  const secureStore = new InMemorySecureStore();
  const transport = new InMemoryMailTransport();

  const outbox = new OutboxProcessor(transport, mailStore, clock);

  return {
    mailStore,
    folderStore,
    contactStore,
    calendarStore,
    secureStore,
    transport,
    setup: new AccountSetupService(transport, secureStore),
    sync: new SyncService(transport, mailStore),
    folders: new FolderSyncService(transport, folderStore),
    outbox,
    search: new SearchService(mailStore, transport),
    compose: new ComposeService(outbox, clock),
    contacts: new ContactsService(transport, contactStore),
    calendar: new CalendarService(transport, calendarStore),
    rules: new RuleProcessor(mailStore, outbox, clock),
  };
}
