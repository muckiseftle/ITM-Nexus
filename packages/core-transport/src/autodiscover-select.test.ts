import { describe, expect, it } from 'vitest';
import type { EndpointCandidate } from './autodiscover-select';
import { selectEndpoints } from './autodiscover-select';

const base: Omit<EndpointCandidate, 'source' | 'priority'> = {
  ewsUrl: 'https://mail.example.com/EWS/Exchange.asmx',
  easUrl: 'https://mail.example.com/Microsoft-Server-ActiveSync',
  authSchemes: ['ntlm', 'basic'],
  reachable: true,
};

describe('selectEndpoints', () => {
  it('wählt den erreichbaren Kandidaten mit niedrigster Priorität', () => {
    const result = selectEndpoints([
      { ...base, source: 'srv', priority: 3 },
      { ...base, source: 'https-root', priority: 1 },
      { ...base, source: 'autodiscover-subdomain', priority: 2 },
    ]);
    expect(result?.source).toBe('https-root');
  });

  it('bevorzugt das stärkste Auth-Verfahren (oauth > ntlm > basic)', () => {
    const result = selectEndpoints([
      { ...base, source: 'https-root', priority: 1, authSchemes: ['basic', 'oauth', 'ntlm'] },
    ]);
    expect(result?.auth).toBe('oauth');
  });

  it('überspringt nicht erreichbare und endpunktlose Kandidaten', () => {
    const result = selectEndpoints([
      { ...base, source: 'https-root', priority: 1, reachable: false },
      { source: 'srv', priority: 2, authSchemes: ['ntlm'], reachable: true },
      { ...base, source: 'manual', priority: 3 },
    ]);
    expect(result?.source).toBe('manual');
  });

  it('gibt undefined zurück, wenn kein Kandidat brauchbar ist', () => {
    expect(selectEndpoints([])).toBeUndefined();
    expect(
      selectEndpoints([{ ...base, source: 'https-root', priority: 1, authSchemes: [] }]),
    ).toBeUndefined();
  });

  it('lässt eas-only Kandidaten zu (kein ewsUrl)', () => {
    const result = selectEndpoints([
      {
        source: 'autodiscover-subdomain',
        priority: 1,
        easUrl: 'https://m.example.com/eas',
        authSchemes: ['basic'],
        reachable: true,
      },
    ]);
    expect(result?.easUrl).toBe('https://m.example.com/eas');
    expect(result?.ewsUrl).toBeUndefined();
  });
});
