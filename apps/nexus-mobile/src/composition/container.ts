import type { Clock, TransportCapabilities } from '@nexus/core-transport';
import {
  AccountSetupService,
  ComposeService,
  OutboxProcessor,
  RuleProcessor,
  SearchService,
  SyncService,
} from '@nexus/services';
import { NexusNative } from '../native/NexusNative';
import { NativeMailTransport, NativeSecureStore, SqlMailStore } from '../native/adapters';

/**
 * Composition-Root der App: konstruiert die nativen Adapter (Ports) und verdrahtet sie mit
 * den plattformunabhängigen `@nexus/services`. Die UI hängt nur an diesem Container, nie an
 * konkreten Adaptern — austauschbar gegen In-Memory-Adapter für Tests/Storybook.
 */
export interface AppContainer {
  readonly secureStore: NativeSecureStore;
  readonly mailStore: SqlMailStore;
  readonly transport: NativeMailTransport;
  readonly setup: AccountSetupService;
  readonly sync: SyncService;
  readonly outbox: OutboxProcessor;
  readonly search: SearchService;
  readonly compose: ComposeService;
  readonly rules: RuleProcessor;
}

const systemClock: Clock = { now: () => Date.now() };

const DEFAULT_CAPABILITIES: TransportCapabilities = {
  ews: true,
  activeSync: true,
  directPush: true,
  publicFolders: true,
  delegation: true,
  serverSearch: true,
};

export async function createContainer(): Promise<AppContainer> {
  await NexusNative.dbInit();

  const secureStore = new NativeSecureStore();
  const mailStore = new SqlMailStore();
  const transport = new NativeMailTransport(DEFAULT_CAPABILITIES);

  const outbox = new OutboxProcessor(transport, mailStore, systemClock);

  return {
    secureStore,
    mailStore,
    transport,
    setup: new AccountSetupService(transport, secureStore),
    sync: new SyncService(transport, mailStore),
    outbox,
    search: new SearchService(mailStore, transport),
    compose: new ComposeService(outbox, systemClock),
    rules: new RuleProcessor(mailStore, outbox, systemClock),
  };
}
