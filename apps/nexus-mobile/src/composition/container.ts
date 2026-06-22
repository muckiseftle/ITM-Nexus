import type { Clock, MailStore, MailTransport, SecureStore } from '@nexus/core-transport';
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
 * App-Container: das Interface, an dem die UI hängt — port-/service-typisiert, damit sowohl
 * der **Live-Container** (native Adapter) als auch der **Demo-Container** (In-Memory) ihn
 * erfüllen. Siehe `demoContainer.ts` für den serverlosen Demo-Modus.
 */
export interface AppContainer {
  readonly secureStore: SecureStore;
  readonly mailStore: MailStore;
  readonly transport: MailTransport;
  readonly setup: AccountSetupService;
  readonly sync: SyncService;
  readonly outbox: OutboxProcessor;
  readonly search: SearchService;
  readonly compose: ComposeService;
  readonly rules: RuleProcessor;
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

/** Live-Container: nutzt die nativen Module (Keychain/Keystore, SQLCipher, EWS/EAS). */
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
