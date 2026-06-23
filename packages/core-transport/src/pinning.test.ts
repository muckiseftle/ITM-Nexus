import { describe, expect, it } from 'vitest';
import { evaluatePinning, findPolicy, isPinningEnabled, type PinningConfig } from './pinning';

const PIN_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const PIN_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=';
const PIN_X = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX=';

const config: PinningConfig = {
  policies: [
    { host: 'mail.contoso.com', pins: [PIN_A, PIN_B] },
    { host: 'contoso.com', pins: [PIN_A], includeSubdomains: true },
  ],
};

describe('evaluatePinning (fail-closed)', () => {
  it('erlaubt Hosts ohne Policy (Pinning inaktiv)', () => {
    const e = evaluatePinning('example.org', [PIN_X], config);
    expect(e.decision).toBe('allow');
    expect(e.reason).toBe('no-policy');
  });

  it('erlaubt bei passendem Pin', () => {
    const e = evaluatePinning('mail.contoso.com', [PIN_X, PIN_B], config);
    expect(e.decision).toBe('allow');
    expect(e.reason).toBe('match');
    expect(e.matchedHost).toBe('mail.contoso.com');
  });

  it('verweigert bei fehlendem Treffer (fail-closed)', () => {
    const e = evaluatePinning('mail.contoso.com', [PIN_X], config);
    expect(e.decision).toBe('deny');
    expect(e.reason).toBe('no-match');
  });

  it('verweigert, wenn keine Pins präsentiert werden', () => {
    const e = evaluatePinning('mail.contoso.com', [], config);
    expect(e.decision).toBe('deny');
    expect(e.reason).toBe('no-pins-presented');
  });

  it('greift für Subdomains nur bei includeSubdomains', () => {
    expect(evaluatePinning('vpn.contoso.com', [PIN_A], config).decision).toBe('allow');
    expect(evaluatePinning('vpn.contoso.com', [PIN_X], config).decision).toBe('deny');
  });

  it('ist case-insensitiv beim Host', () => {
    expect(evaluatePinning('MAIL.Contoso.COM', [PIN_A], config).decision).toBe('allow');
  });
});

describe('findPolicy', () => {
  it('bevorzugt die exakte Host-Policy vor der Subdomain-Wildcard', () => {
    expect(findPolicy(config, 'mail.contoso.com')?.host).toBe('mail.contoso.com');
  });
});

describe('isPinningEnabled', () => {
  it('true, sobald mindestens ein Host Pins hat', () => {
    expect(isPinningEnabled(config)).toBe(true);
    expect(isPinningEnabled({ policies: [] })).toBe(false);
    expect(isPinningEnabled({ policies: [{ host: 'x', pins: [] }] })).toBe(false);
  });
});
