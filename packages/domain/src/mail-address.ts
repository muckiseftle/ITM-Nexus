import type { MailAddress } from './models';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Einfache, bewusst konservative Syntaxprüfung (keine vollständige RFC-5322-Validierung). */
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/**
 * Erzeugt eine normalisierte {@link MailAddress}: trimmt, kleinschreibt die Domain
 * (Local-Part bleibt unangetastet) und validiert die Syntax.
 * @throws Error wenn die Adresse ungültig ist.
 */
export function createMailAddress(address: string, displayName?: string): MailAddress {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || !isValidEmail(trimmed)) {
    throw new Error(`Ungültige E-Mail-Adresse: "${address}"`);
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  const normalized = `${local}@${domain}`;

  const name = displayName?.trim();
  return name !== undefined && name.length > 0
    ? { address: normalized, displayName: name }
    : { address: normalized };
}

/** Vergleicht zwei Adressen case-insensitiv über den Adressteil. */
export function mailAddressEquals(a: MailAddress, b: MailAddress): boolean {
  return a.address.toLowerCase() === b.address.toLowerCase();
}
