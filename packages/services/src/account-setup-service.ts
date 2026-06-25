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

  /**
   * Schritt 1: Endpunkt ermitteln (Autodiscover bzw. manuelle Konfiguration). Persistiert
   * NICHTS und prüft die Anmeldedaten NICHT — erlaubt der UI, dem Nutzer die ermittelte
   * EWS-URL anzuzeigen, bevor die eigentliche Anmeldung erfolgt.
   */
  async discover(email: string, credentials: Credentials): Promise<AutodiscoverResult> {
    const result = await this.transport.discover(email, credentials);
    // Im manuellen Modus die feste EWS-Konfiguration bevorzugen, falls der Transport
    // (z. B. der In-Memory-Fall) keinen Endpunkt aus der Antwort liefert.
    const ewsUrl = result.ewsUrl ?? credentials.manual?.ewsUrl;
    const easUrl = result.easUrl ?? credentials.manual?.easUrl;
    return {
      ...result,
      ...(ewsUrl !== undefined ? { ewsUrl } : {}),
      ...(easUrl !== undefined ? { easUrl } : {}),
    };
  }

  /**
   * Schritt 2: Echte Anmeldeprüfung (genau ein authentifizierter Roundtrip) und — nur bei
   * Erfolg — Persistenz von Secret + Metadaten im {@link SecureStore}. Schlägt die Prüfung
   * fehl, wird KEIN Konto gespeichert (kein „Pseudo-Login").
   */
  async completeSetup(
    email: string,
    credentials: Credentials,
    discovered: AutodiscoverResult,
  ): Promise<AutodiscoverResult> {
    // Ohne EWS-Endpunkt kann der native Hintergrund-Task die Sitzung später nicht
    // wiederherstellen (stiller Logout beim Kaltstart) — daher gar nicht erst speichern.
    if (discovered.ewsUrl === undefined || discovered.ewsUrl.length === 0) {
      throw new Error('AUTODISCOVER: Kein EWS-Endpunkt ermittelt — Server manuell angeben.');
    }
    await this.transport.verifyCredentials(email);

    // Persistenz atomar behandeln: schlägt ein Teilschritt fehl, alles zurücknehmen, damit
    // kein halb eingerichtetes Konto (z. B. verwaistes Secret) zurückbleibt.
    try {
      await this.secureStore.set(secretKey(email), credentials.secret);
      await this.secureStore.set(
        metaKey(email),
        JSON.stringify({
          username: credentials.username,
          scheme: credentials.scheme,
          ...(credentials.domain !== undefined ? { domain: credentials.domain } : {}),
          auth: discovered.auth,
          ewsUrl: discovered.ewsUrl,
          easUrl: discovered.easUrl,
          manual: credentials.manual !== undefined,
        }),
      );
      // Aktives Konto markieren (für nativen Hintergrund-Sync ohne JS-Kontext).
      await this.secureStore.set(CURRENT_ACCOUNT_KEY, email.toLowerCase());
    } catch (e) {
      await this.forget(email).catch(() => undefined);
      throw e;
    }

    return discovered;
  }

  /** Bequemer Gesamtablauf: Endpunkt ermitteln → Anmeldung prüfen → speichern. */
  async setUp(email: string, credentials: Credentials): Promise<AutodiscoverResult> {
    const discovered = await this.discover(email, credentials);
    return this.completeSetup(email, credentials, discovered);
  }

  /**
   * Passwort eines bereits eingerichteten Kontos neu setzen (nach serverseitiger Änderung):
   * erst gegen den Server prüfen (authentifizierter Roundtrip), dann — nur bei Erfolg — das
   * Secret im {@link SecureStore} aktualisieren. Schlägt die Prüfung fehl, bleibt das alte
   * Secret unverändert (kein „halber" Wechsel).
   */
  async updatePassword(email: string, newSecret: string): Promise<void> {
    await this.transport.updatePassword(email, newSecret);
    await this.secureStore.set(secretKey(email), newSecret);
  }

  /** Sicheres Vergessen eines Kontos (Teil der Datenlöschungs-Strategie). */
  async forget(email: string): Promise<void> {
    await this.secureStore.delete(secretKey(email));
    await this.secureStore.delete(metaKey(email));
    await this.secureStore.delete(CURRENT_ACCOUNT_KEY);
  }
}
