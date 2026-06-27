import type { Credentials, SecureStore } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { AccountSetupService } from './account-setup-service';
import { InMemorySecureStore } from './in-memory-store';
import { FakeMailTransport } from './testing/fakes';

/** SecureStore, der beim N-ten `set` fehlschlägt (für Rollback-Tests). */
class FlakySecureStore extends InMemorySecureStore implements SecureStore {
  private sets = 0;
  constructor(private readonly failOnSet: number) {
    super();
  }
  override async set(key: string, value: string): Promise<void> {
    this.sets += 1;
    if (this.sets === this.failOnSet) throw new Error('Keychain-Schreibfehler');
    await super.set(key, value);
  }
}

const credentials: Credentials = {
  username: 'm.brandt',
  secret: 'super-geheim',
  scheme: 'ntlm',
};

describe('AccountSetupService', () => {
  it('führt Autodiscover aus und legt Secret + Metadaten im SecureStore ab', async () => {
    const secure = new InMemorySecureStore();
    const service = new AccountSetupService(new FakeMailTransport(), secure);

    const result = await service.setUp('M.Brandt@Example.com', credentials);

    expect(result.emailAddress).toBe('M.Brandt@Example.com');
    expect(result.ewsUrl).toBeDefined();

    // Secret liegt ausschließlich im SecureStore (Keychain-Boundary), Key kleingeschrieben.
    expect(await secure.get('nexus:secret:m.brandt@example.com')).toBe('super-geheim');
    const meta = await secure.get('nexus:account:m.brandt@example.com');
    expect(meta).toContain('"username":"m.brandt"');
  });

  it('nutzt die manuelle Serverkonfiguration und persistiert die EWS-URL', async () => {
    const secure = new InMemorySecureStore();
    const transport = new FakeMailTransport();
    const service = new AccountSetupService(transport, secure);

    const manualCreds: Credentials = {
      username: 'CONTOSO\\m.brandt',
      secret: 'geheim',
      scheme: 'ntlm',
      domain: 'CONTOSO',
      manual: { ewsUrl: 'https://mail.contoso.com/EWS/Exchange.asmx' },
    };

    const result = await service.setUp('m.brandt@contoso.com', manualCreds);

    // Manuelle EWS-URL gewinnt, auch wenn „Autodiscover" keinen Endpunkt liefert.
    expect(result.ewsUrl).toBe('https://mail.contoso.com/EWS/Exchange.asmx');
    expect(transport.lastDiscoverCredentials?.manual?.ewsUrl).toBe(
      'https://mail.contoso.com/EWS/Exchange.asmx',
    );

    const meta = await secure.get('nexus:account:m.brandt@contoso.com');
    expect(meta).toContain('"domain":"CONTOSO"');
    expect(meta).toContain('"manual":true');
    expect(meta).toContain('https://mail.contoso.com/EWS/Exchange.asmx');
  });

  it('prüft die Anmeldedaten mit einem authentifizierten Roundtrip', async () => {
    const secure = new InMemorySecureStore();
    const transport = new FakeMailTransport();
    const service = new AccountSetupService(transport, secure);

    await service.setUp('user@example.com', credentials);

    expect(transport.verifyCallCount).toBe(1);
  });

  it('speichert KEIN Konto, wenn die Anmeldung abgelehnt wird', async () => {
    const secure = new InMemorySecureStore();
    const transport = new FakeMailTransport({ failVerify: true });
    const service = new AccountSetupService(transport, secure);

    await expect(service.setUp('user@example.com', credentials)).rejects.toThrow();

    // Kein „Pseudo-Login": weder Secret noch Metadaten noch aktives Konto dürfen entstehen.
    expect(await secure.get('nexus:secret:user@example.com')).toBeUndefined();
    expect(await secure.get('nexus:account:user@example.com')).toBeUndefined();
    expect(await secure.get('nexus:current-account')).toBeUndefined();
  });

  it('rollt die Persistenz zurück, wenn ein Schreibschritt fehlschlägt', async () => {
    const secure = new FlakySecureStore(2); // 2. set() (Metadaten) schlägt fehl
    const service = new AccountSetupService(new FakeMailTransport(), secure);

    await expect(service.setUp('user@example.com', credentials)).rejects.toThrow();

    // Bereits geschriebenes Secret muss wieder entfernt sein (kein halbes Konto).
    expect(await secure.get('nexus:secret:user@example.com')).toBeUndefined();
    expect(await secure.get('nexus:current-account')).toBeUndefined();
  });

  it('forget entfernt Secret und Metadaten', async () => {
    const secure = new InMemorySecureStore();
    const service = new AccountSetupService(new FakeMailTransport(), secure);

    await service.setUp('user@example.com', credentials);
    await service.forget('user@example.com');

    expect(await secure.get('nexus:secret:user@example.com')).toBeUndefined();
    expect(await secure.get('nexus:account:user@example.com')).toBeUndefined();
  });

  it('führt mehrere Konten in der Registry und kann das aktive umschalten', async () => {
    const secure = new InMemorySecureStore();
    const service = new AccountSetupService(new FakeMailTransport(), secure);

    await service.setUp('a@example.com', credentials);
    await service.setUp('b@example.com', credentials);

    const accounts = await service.listAccounts();
    expect(accounts.map((a) => a.email).sort()).toEqual(['a@example.com', 'b@example.com']);
    // Zuletzt eingerichtetes Konto ist aktiv.
    expect(await service.currentAccount()).toBe('b@example.com');

    await service.activate('a@example.com');
    expect(await service.currentAccount()).toBe('a@example.com');
  });

  it('forget des aktiven Kontos lässt ein verbleibendes Konto nachrücken', async () => {
    const secure = new InMemorySecureStore();
    const service = new AccountSetupService(new FakeMailTransport(), secure);

    await service.setUp('a@example.com', credentials);
    await service.setUp('b@example.com', credentials); // b ist aktiv
    await service.forget('b@example.com');

    expect((await service.listAccounts()).map((a) => a.email)).toEqual(['a@example.com']);
    // Aktiv-Zeiger rückt auf das verbleibende Konto nach (kein toter Zeiger).
    expect(await service.currentAccount()).toBe('a@example.com');

    await service.forget('a@example.com');
    expect(await service.listAccounts()).toEqual([]);
    expect(await service.currentAccount()).toBeNull();
  });
});
