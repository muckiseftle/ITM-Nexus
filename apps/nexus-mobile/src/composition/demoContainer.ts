import {
  BackgroundSyncService,
  InMemorySyncCursorStore,
  createInMemoryContainer,
  seedDemoData,
} from '@nexus/services';
import type { Clock } from '@nexus/core-transport';
import { toContactId, type Contact } from '@nexus/domain';
import type { AppContainer } from './container';
import { defaultSyncTargets } from './container';

const demoClock: Clock = { now: () => Date.now() };

let demoContactSeq = 0;

/**
 * Demo-Container: verdrahtet die In-Memory-Adapter mit allen Services und seedet
 * Beispieldaten. Erlaubt das Starten der App **ohne Server und ohne native Module** —
 * ideal, um NEXUS auf dem Gerät/Simulator zu erleben (siehe config.ts → APP_MODE).
 */
export async function createDemoContainer(): Promise<AppContainer> {
  const c = createInMemoryContainer();
  await seedDemoData(c);
  const cursors = new InMemorySyncCursorStore();

  return {
    secureStore: c.secureStore,
    mailStore: c.mailStore,
    calendarStore: c.calendarStore,
    contactStore: c.contactStore,
    transport: c.transport,
    setup: c.setup,
    sync: c.sync,
    cursors,
    outbox: c.outbox,
    search: c.search,
    compose: c.compose,
    rules: c.rules,
    calendar: c.calendar,
    contacts: c.contacts,
    folders: c.folders,
    backgroundSync: new BackgroundSyncService(
      c.sync,
      c.folders,
      c.calendar,
      c.contacts,
      c.outbox,
      demoClock,
      defaultSyncTargets(),
      cursors,
    ),
    // Kontakte-CRUD im Demo-Modus rein lokal (kein Server) — damit der UI-Fluss testbar ist.
    createContact: async (_account, contact) => {
      demoContactSeq += 1;
      const id = contact.id.length > 0 ? contact.id : `demo-contact-${String(demoContactSeq)}`;
      const saved: Contact = { ...contact, id: toContactId(id) };
      await c.contactStore.upsertContacts([saved]);
      return saved;
    },
    updateContact: async (_account, contact) => {
      await c.contactStore.upsertContacts([contact]);
    },
    deleteContact: async (account, contactId) => {
      await c.contactStore.deleteContacts(account, [contactId]);
    },
  };
}
