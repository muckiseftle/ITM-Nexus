import { createInMemoryContainer, seedDemoData } from '@nexus/services';
import type { AppContainer } from './container';

/**
 * Demo-Container: verdrahtet die In-Memory-Adapter mit allen Services und seedet
 * Beispieldaten. Erlaubt das Starten der App **ohne Server und ohne native Module** —
 * ideal, um NEXUS auf dem Gerät/Simulator zu erleben (siehe config.ts → APP_MODE).
 */
export async function createDemoContainer(): Promise<AppContainer> {
  const c = createInMemoryContainer();
  await seedDemoData(c);

  return {
    secureStore: c.secureStore,
    mailStore: c.mailStore,
    calendarStore: c.calendarStore,
    contactStore: c.contactStore,
    transport: c.transport,
    setup: c.setup,
    sync: c.sync,
    outbox: c.outbox,
    search: c.search,
    compose: c.compose,
    rules: c.rules,
    calendar: c.calendar,
    contacts: c.contacts,
  };
}
