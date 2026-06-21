import { describe, expect, it } from 'vitest';
import { createMailAddress, isValidEmail, mailAddressEquals } from './mail-address';

describe('isValidEmail', () => {
  it('akzeptiert gültige Adressen', () => {
    expect(isValidEmail('a@b.de')).toBe(true);
    expect(isValidEmail('first.last@sub.example.com')).toBe(true);
  });

  it('lehnt ungültige Adressen ab', () => {
    expect(isValidEmail('keine-mail')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.de')).toBe(false);
    expect(isValidEmail('@c.de')).toBe(false);
  });
});

describe('createMailAddress', () => {
  it('normalisiert Domain (lowercase) und trimmt', () => {
    const addr = createMailAddress('  User@Example.COM ');
    expect(addr.address).toBe('User@example.com');
    expect(addr.displayName).toBeUndefined();
  });

  it('übernimmt einen getrimmten Anzeigenamen', () => {
    const addr = createMailAddress('user@example.com', '  Max Mustermann  ');
    expect(addr.displayName).toBe('Max Mustermann');
  });

  it('ignoriert leeren Anzeigenamen', () => {
    const addr = createMailAddress('user@example.com', '   ');
    expect(addr.displayName).toBeUndefined();
  });

  it('wirft bei ungültiger Adresse', () => {
    expect(() => createMailAddress('nope')).toThrow(/Ungültige E-Mail-Adresse/);
  });
});

describe('mailAddressEquals', () => {
  it('vergleicht case-insensitiv', () => {
    const a = createMailAddress('User@Example.com');
    const b = createMailAddress('user@example.com');
    expect(mailAddressEquals(a, b)).toBe(true);
  });

  it('erkennt Unterschiede', () => {
    const a = createMailAddress('a@example.com');
    const b = createMailAddress('b@example.com');
    expect(mailAddressEquals(a, b)).toBe(false);
  });
});
