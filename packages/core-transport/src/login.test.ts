import { describe, expect, it } from 'vitest';
import { parseLogin, toDownLevel, toUpn } from './login';

describe('parseLogin', () => {
  it('erkennt Down-Level (DOMÄNE\\Benutzer)', () => {
    const p = parseLogin('CONTOSO\\m.brandt');
    expect(p.form).toBe('downlevel');
    expect(p.domain).toBe('CONTOSO');
    expect(p.user).toBe('m.brandt');
  });

  it('erkennt UPN (benutzer@domäne)', () => {
    const p = parseLogin('m.brandt@contoso.com');
    expect(p.form).toBe('upn');
    expect(p.domain).toBe('contoso.com');
    expect(p.user).toBe('m.brandt');
  });

  it('erkennt den baren Benutzernamen', () => {
    const p = parseLogin('m.brandt');
    expect(p.form).toBe('bare');
    expect(p.domain).toBeUndefined();
    expect(p.user).toBe('m.brandt');
  });

  it('trimmt Eingaben und lässt Down-Level vor UPN gewinnen', () => {
    const p = parseLogin('  CONTOSO\\m.brandt@host  ');
    expect(p.form).toBe('downlevel');
    expect(p.domain).toBe('CONTOSO');
    expect(p.user).toBe('m.brandt@host');
  });

  it('behandelt führende/abschließende Trennzeichen als bar', () => {
    expect(parseLogin('\\user').form).toBe('bare');
    expect(parseLogin('user@').form).toBe('bare');
    expect(parseLogin('@domain').form).toBe('bare');
  });
});

describe('toDownLevel', () => {
  it('behält die Down-Level-Form bei', () => {
    expect(toDownLevel(parseLogin('CONTOSO\\m.brandt'))).toBe('CONTOSO\\m.brandt');
  });

  it('ergänzt eine Fallback-Domäne für bare Namen', () => {
    expect(toDownLevel(parseLogin('m.brandt'), 'CONTOSO')).toBe('CONTOSO\\m.brandt');
  });

  it('lässt UPN ohne expliziten Fallback unverändert', () => {
    expect(toDownLevel(parseLogin('m.brandt@contoso.com'))).toBe('m.brandt@contoso.com');
  });

  it('wandelt UPN mit NetBIOS-Fallback in Down-Level', () => {
    expect(toDownLevel(parseLogin('m.brandt@contoso.com'), 'CONTOSO')).toBe('CONTOSO\\m.brandt');
  });
});

describe('toUpn', () => {
  it('behält UPN bei', () => {
    expect(toUpn(parseLogin('m.brandt@contoso.com'))).toBe('m.brandt@contoso.com');
  });

  it('bildet UPN aus barem Namen + E-Mail-Domäne', () => {
    expect(toUpn(parseLogin('m.brandt'), 'contoso.com')).toBe('m.brandt@contoso.com');
  });
});
