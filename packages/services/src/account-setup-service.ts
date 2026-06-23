import type {
  AutodiscoverResult,
  Credentials,
  MailTransport,
  SecureStore,
} from '@nexus/core-transport';

const secretKey = (email: string): string => `nexus:secret:${email.toLowerCase()}`;
const metaKey = (email: string): string => `nexus:account:${email.toLowerCase()}`;
/** Zeiger auf das aktive Konto — der native Hintergrund-Task liest ihn beim Cold Start. */
const CURRENT_ACCOUNT_KEY = 'nexus:current-account';

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

    // Im manuellen Modus die feste EWS-Konfiguration bevorzugen, falls der Transport
    // (z. B. der In-Memory-Fall) keinen Endpunkt aus der Antwort liefert.
    const ewsUrl = result.ewsUrl ?? credentials.manual?.ewsUrl;
    const easUrl = result.easUrl ?? credentials.manual?.easUrl;

    await this.secureStore.set(secretKey(email), credentials.secret);
    await this.secureStore.set(
      metaKey(email),
      JSON.stringify({
        username: credentials.username,
        scheme: credentials.scheme,
        ...(credentials.domain !== undefined ? { domain: credentials.domain } : {}),
        auth: result.auth,
        ewsUrl,
        easUrl,
        manual: credentials.manual !== undefined,
      }),
    );
    // Aktives Konto markieren (für nativen Hintergrund-Sync ohne JS-Kontext).
    await this.secureStore.set(CURRENT_ACCOUNT_KEY, email.toLowerCase());

    return {
      ...result,
      ...(ewsUrl !== undefined ? { ewsUrl } : {}),
      ...(easUrl !== undefined ? { easUrl } : {}),
    };
  }

  /** Sicheres Vergessen eines Kontos (Teil der Datenlöschungs-Strategie). */
  async forget(email: string): Promise<void> {
    await this.secureStore.delete(secretKey(email));
    await this.secureStore.delete(metaKey(email));
    await this.secureStore.delete(CURRENT_ACCOUNT_KEY);
  }
}
