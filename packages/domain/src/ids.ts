/**
 * Branded ID-Typen: verhindern, dass z. B. eine `FolderId` versehentlich dort verwendet
 * wird, wo eine `MessageId` erwartet wird — rein typseitig, ohne Laufzeit-Overhead.
 */

declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type AccountId = Brand<string, 'AccountId'>;
export type FolderId = Brand<string, 'FolderId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type ContactId = Brand<string, 'ContactId'>;
export type EventId = Brand<string, 'EventId'>;

/** Erzeugt eine gebrandete ID und stellt sicher, dass sie nicht leer ist. */
export function brandId<B extends string>(value: string, kind: B): Brand<string, B> {
  if (value.trim().length === 0) {
    throw new Error(`Ungültige ID: ${kind} darf nicht leer sein.`);
  }
  return value as Brand<string, B>;
}

export const toAccountId = (value: string): AccountId => brandId(value, 'AccountId');
export const toFolderId = (value: string): FolderId => brandId(value, 'FolderId');
export const toMessageId = (value: string): MessageId => brandId(value, 'MessageId');
export const toContactId = (value: string): ContactId => brandId(value, 'ContactId');
export const toEventId = (value: string): EventId => brandId(value, 'EventId');
