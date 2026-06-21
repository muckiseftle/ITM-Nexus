/**
 * Diskriminierte Fehler-Taxonomie der Transport-Schicht. Obere Schichten verzweigen über
 * das `code`-Feld statt über String-Matching von Meldungen.
 */

export type TransportErrorCode = 'auth' | 'network' | 'throttled' | 'conflict' | 'protocol';

export abstract class TransportError extends Error {
  abstract readonly code: TransportErrorCode;

  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class AuthError extends TransportError {
  readonly code = 'auth';
}

export class NetworkError extends TransportError {
  readonly code = 'network';
}

export class ThrottledError extends TransportError {
  readonly code = 'throttled';
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.retryAfterMs = retryAfterMs;
  }
}

export class ConflictError extends TransportError {
  readonly code = 'conflict';
}

export class ProtocolError extends TransportError {
  readonly code = 'protocol';
}

export function isTransportError(value: unknown): value is TransportError {
  return value instanceof TransportError;
}
