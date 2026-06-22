import { describe, expect, it } from 'vitest';
import { classifyError } from './error-info';
import { AuthError, NetworkError } from './errors';

describe('classifyError', () => {
  it('erkennt Auth-Fehler über Code und über 401/Text', () => {
    expect(classifyError({ code: 'auth', message: 'x' }).kind).toBe('auth');
    expect(classifyError(new AuthError('abgelehnt')).kind).toBe('auth');
    expect(classifyError(new Error('HTTP 401 Unauthorized')).kind).toBe('auth');
    expect(classifyError('Anmeldedaten falsch').kind).toBe('auth');
  });

  it('erkennt Autodiscover-Fehler', () => {
    const info = classifyError(new Error('Autodiscover fehlgeschlagen für example.com'));
    expect(info.kind).toBe('autodiscover');
    expect(info.title).toBe('Server nicht gefunden');
  });

  it('erkennt Netzwerk-/Erreichbarkeitsfehler', () => {
    expect(classifyError(new NetworkError('could not connect to server')).kind).toBe('network');
    expect(classifyError(new Error('The request timed out')).kind).toBe('network');
    expect(classifyError({ code: 'server_unreachable', message: 'x' }).kind).toBe('network');
  });

  it('erkennt Zertifikatsprobleme', () => {
    expect(classifyError(new Error('The certificate is not trusted')).kind).toBe('tls');
    expect(classifyError(new Error('self-signed certificate')).kind).toBe('tls');
  });

  it('erkennt Serverfehler (5xx)', () => {
    expect(classifyError(new Error('EWS HTTP 500')).kind).toBe('server');
  });

  it('erkennt DB-Fehler', () => {
    expect(classifyError({ code: 'db_init', message: 'SQLCipher key invalid' }).kind).toBe(
      'database',
    );
  });

  it('fällt auf unknown zurück und behält die technische Meldung', () => {
    const info = classifyError(new Error('irgendwas seltsames'));
    expect(info.kind).toBe('unknown');
    expect(info.technical).toBe('irgendwas seltsames');
  });

  it('priorisiert Auth vor Autodiscover bei 401 während Autodiscover', () => {
    expect(classifyError(new Error('Autodiscover: HTTP 401')).kind).toBe('auth');
  });

  it('liefert immer einen Titel und eine technische Meldung', () => {
    const info = classifyError(undefined);
    expect(info.title.length).toBeGreaterThan(0);
    expect(info.technical.length).toBeGreaterThan(0);
  });
});
