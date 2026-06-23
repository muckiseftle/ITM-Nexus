import type { Credentials } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { AccountSetupService } from './account-setup-service';
import { InMemorySecureStore } from './in-memory-store';
import { FakeMailTransport } from './testing/fakes';

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

  it('forget entfernt Secret und Metadaten', async () => {
    const secure = new InMemorySecureStore();
    const service = new AccountSetupService(new FakeMailTransport(), secure);

    await service.setUp('user@example.com', credentials);
    await service.forget('user@example.com');

    expect(await secure.get('nexus:secret:user@example.com')).toBeUndefined();
    expect(await secure.get('nexus:account:user@example.com')).toBeUndefined();
  });
});
