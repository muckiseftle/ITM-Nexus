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
/** Registry aller eingerichteten Konten (JSON-Array kleingeschriebener E-Mail-Adressen). */
const ACCOUNTS_KEY = 'nexus:accounts';

/** Ein in der Registry hinterlegtes Konto (E-Mail + Anzeige-Benutzername aus den Metadaten). */
export interface StoredAccount {
  readonly email: string;
  readonly username: string;
}

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
          // Protokollwahl: true ⇒ bewusst EWS (Kompatibilitätsmodus); sonst EAS bevorzugt.
          preferEws: credentials.preferEws === true,
          // EAS-Hardfailure → EWS-Fallback nur, wenn in der Anmeldung erlaubt (Standard aus ⇒ nur EAS).
          easFallbackToEws: credentials.easFallbackToEws === true,
        }),
      );
      // Aktives Konto markieren (für nativen Hintergrund-Sync ohne JS-Kontext).
      await this.secureStore.set(CURRENT_ACCOUNT_KEY, email.toLowerCase());
      // In die Konten-Registry aufnehmen (Multi-Account-Liste/-Umschalter).
      const emails = await this.readAccountEmails();
      await this.writeAccountEmails([...emails, email.toLowerCase()]);
    } catch (e) {
      await this.forget(email).catch(() => undefined);
      throw e;
    }

    return discovered;
  }

  /** Liste der hinterlegten Konto-E-Mails (Registry). Leeres Array, wenn keine vorhanden. */
  private async readAccountEmails(): Promise<string[]> {
    const raw = await this.secureStore.get(ACCOUNTS_KEY);
    if (raw === undefined) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private async writeAccountEmails(emails: readonly string[]): Promise<void> {
    await this.secureStore.set(ACCOUNTS_KEY, JSON.stringify([...new Set(emails)]));
  }

  /** Alle eingerichteten Konten (E-Mail + Anzeige-Benutzername aus den Metadaten). */
  async listAccounts(): Promise<readonly StoredAccount[]> {
    const emails = await this.readAccountEmails();
    const accounts: StoredAccount[] = [];
    for (const email of emails) {
      let username = email;
      try {
        const metaRaw = await this.secureStore.get(metaKey(email));
        if (metaRaw !== undefined) {
          const meta = JSON.parse(metaRaw) as { username?: unknown };
          if (typeof meta.username === 'string' && meta.username.length > 0)
            username = meta.username;
        }
      } catch {
        /* Metadaten unlesbar → E-Mail als Anzeigename verwenden */
      }
      accounts.push({ email, username });
    }
    return accounts;
  }

  /** E-Mail des aktiven Kontos (oder null). */
  async currentAccount(): Promise<string | null> {
    return (await this.secureStore.get(CURRENT_ACCOUNT_KEY)) ?? null;
  }

  /**
   * Aktives Konto umschalten — setzt nur den Zeiger im SecureStore. Die Reaktivierung der
   * Transport-Zugangsdaten (nativer Keychain-Restore) übernimmt der Container/Aufrufer.
   */
  async activate(email: string): Promise<void> {
    await this.secureStore.set(CURRENT_ACCOUNT_KEY, email.toLowerCase());
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

  /**
   * Sicheres Vergessen eines Kontos (Teil der Datenlöschungs-Strategie). Entfernt Secret +
   * Metadaten + Registry-Eintrag. War es das aktive Konto, rückt — falls vorhanden — ein
   * verbleibendes Konto nach (Multi-Account), sonst wird der Aktiv-Zeiger gelöscht.
   */
  async forget(email: string): Promise<void> {
    const e = email.toLowerCase();
    await this.secureStore.delete(secretKey(e));
    await this.secureStore.delete(metaKey(e));
    const remaining = (await this.readAccountEmails()).filter((a) => a !== e);
    await this.writeAccountEmails(remaining);
    const current = await this.secureStore.get(CURRENT_ACCOUNT_KEY);
    if (current === e) {
      const [next] = remaining;
      if (next !== undefined) await this.secureStore.set(CURRENT_ACCOUNT_KEY, next);
      else await this.secureStore.delete(CURRENT_ACCOUNT_KEY);
    }
  }
}
