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

  it('forget entfernt Secret und Metadaten', async () => {
    const secure = new InMemorySecureStore();
    const service = new AccountSetupService(new FakeMailTransport(), secure);

    await service.setUp('user@example.com', credentials);
    await service.forget('user@example.com');

    expect(await secure.get('nexus:secret:user@example.com')).toBeUndefined();
    expect(await secure.get('nexus:account:user@example.com')).toBeUndefined();
  });
});
