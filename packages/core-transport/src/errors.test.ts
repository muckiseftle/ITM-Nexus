import { describe, expect, it } from 'vitest';
import {
  AuthError,
  ConflictError,
  NetworkError,
  ProtocolError,
  ThrottledError,
  TransportError,
  isTransportError,
} from './errors';

describe('TransportError-Hierarchie', () => {
  it('trägt typisierte Codes', () => {
    expect(new AuthError('x').code).toBe('auth');
    expect(new NetworkError('x').code).toBe('network');
    expect(new ConflictError('x').code).toBe('conflict');
    expect(new ProtocolError('x').code).toBe('protocol');
    expect(new ThrottledError('x', 500).code).toBe('throttled');
  });

  it('setzt den Klassennamen und ist ein Error', () => {
    const err = new AuthError('fehlgeschlagen');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TransportError);
    expect(err.name).toBe('AuthError');
    expect(err.message).toBe('fehlgeschlagen');
  });

  it('ThrottledError trägt retryAfterMs und cause', () => {
    const cause = new Error('429');
    const err = new ThrottledError('zu viele Anfragen', 1500, { cause });
    expect(err.retryAfterMs).toBe(1500);
    expect(err.cause).toBe(cause);
  });

  it('isTransportError unterscheidet korrekt', () => {
    expect(isTransportError(new NetworkError('x'))).toBe(true);
    expect(isTransportError(new Error('x'))).toBe(false);
    expect(isTransportError('x')).toBe(false);
  });
});
