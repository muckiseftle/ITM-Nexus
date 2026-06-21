import type {
  AutodiscoverResult,
  Credentials,
  MailTransport,
  SecureStore,
} from '@nexus/core-transport';

const secretKey = (email: string): string => `nexus:secret:${email.toLowerCase()}`;
const metaKey = (email: string): string => `nexus:account:${email.toLowerCase()}`;

/**
 * Konto-Einrichtung: führt Autodiscover über den Transport-Port aus und legt das Secret
 * sowie Konto-Metadaten ausschließlich im {@link SecureStore} (Keychain/Keystore) ab.
 * Das Secret wird nie außerhalb des SecureStore persistiert.
 */
export class AccountSetupService {
  constructor(
    private readonly transport: MailTransport,
    private readonly secureStore: SecureStore,
  ) {}

  async setUp(email: string, credentials: Credentials): Promise<AutodiscoverResult> {
    const result = await this.transport.discover(email, credentials);

    await this.secureStore.set(secretKey(email), credentials.secret);
    await this.secureStore.set(
      metaKey(email),
      JSON.stringify({
        username: credentials.username,
        scheme: credentials.scheme,
        auth: result.auth,
        ewsUrl: result.ewsUrl,
        easUrl: result.easUrl,
      }),
    );

    return result;
  }

  /** Sicheres Vergessen eines Kontos (Teil der Datenlöschungs-Strategie). */
  async forget(email: string): Promise<void> {
    await this.secureStore.delete(secretKey(email));
    await this.secureStore.delete(metaKey(email));
  }
}
