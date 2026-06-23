import { describe, expect, it } from 'vitest';
import {
  buildAutodiscoverProbes,
  buildEwsFallbackUrls,
  domainFromEmail,
  normalizeEwsUrl,
} from './autodiscover';

describe('domainFromEmail', () => {
  it('extrahiert und normalisiert die Domäne', () => {
    expect(domainFromEmail('M.Brandt@Contoso.COM')).toBe('contoso.com');
  });
  it('liefert undefined bei ungültigen Adressen', () => {
    expect(domainFromEmail('keine-mail')).toBeUndefined();
    expect(domainFromEmail('user@')).toBeUndefined();
    expect(domainFromEmail('@domain')).toBeUndefined();
  });
});

describe('buildAutodiscoverProbes', () => {
  it('liefert die MS-konforme Reihenfolge (root → subdomain → http-redirect)', () => {
    const probes = buildAutodiscoverProbes('contoso.com');
    expect(probes.map((p) => p.source)).toEqual([
      'https-root',
      'autodiscover-subdomain',
      'http-redirect',
    ]);
    expect(probes.map((p) => p.priority)).toEqual([1, 2, 3]);
  });

  it('verwendet die korrekten URLs und Methoden', () => {
    const probes = buildAutodiscoverProbes('contoso.com');
    expect(probes[0]?.url).toBe('https://contoso.com/autodiscover/autodiscover.xml');
    expect(probes[0]?.method).toBe('POST');
    expect(probes[1]?.url).toBe('https://autodiscover.contoso.com/autodiscover/autodiscover.xml');
    expect(probes[2]?.url).toBe('http://autodiscover.contoso.com/autodiscover/autodiscover.xml');
    expect(probes[2]?.method).toBe('GET');
  });

  it('normalisiert die Domäne (Kleinschreibung, Trim)', () => {
    expect(buildAutodiscoverProbes('  Contoso.COM ')[0]?.url).toBe(
      'https://contoso.com/autodiscover/autodiscover.xml',
    );
  });
});

describe('buildEwsFallbackUrls', () => {
  it('liefert die Standard-EWS-Direktpfade', () => {
    expect(buildEwsFallbackUrls('contoso.com')).toEqual([
      'https://contoso.com/EWS/Exchange.asmx',
      'https://autodiscover.contoso.com/EWS/Exchange.asmx',
      'https://mail.contoso.com/EWS/Exchange.asmx',
    ]);
  });
});

describe('normalizeEwsUrl', () => {
  it('ergänzt https und den EWS-Standardpfad bei bloßem Host', () => {
    expect(normalizeEwsUrl('mail.contoso.com')).toBe('https://mail.contoso.com/EWS/Exchange.asmx');
  });
  it('belässt eine vollständige URL (mit Pfad) unverändert', () => {
    expect(normalizeEwsUrl('https://mail.contoso.com/EWS/Exchange.asmx')).toBe(
      'https://mail.contoso.com/EWS/Exchange.asmx',
    );
  });
  it('ergänzt den Pfad auch bei angegebenem Schema ohne Pfad', () => {
    expect(normalizeEwsUrl('https://mail.contoso.com')).toBe(
      'https://mail.contoso.com/EWS/Exchange.asmx',
    );
  });
  it('liefert undefined bei leerer Eingabe', () => {
    expect(normalizeEwsUrl('   ')).toBeUndefined();
  });
});
