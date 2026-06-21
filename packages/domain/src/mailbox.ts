import type { MailAddress } from './models';

/**
 * Modell für Postfächer und Delegation. Bildet die Exchange-Sendesemantik ab:
 * - **SendAs**: Nachricht erscheint, als käme sie direkt vom (Shared-)Postfach.
 * - **SendOnBehalf**: Nachricht erscheint als „<Delegat> im Auftrag von <Postfach>".
 */

export type MailboxKind = 'primary' | 'shared' | 'delegated';

export type MailboxPermission = 'read' | 'write' | 'sendAs' | 'sendOnBehalf';

export interface Mailbox {
  readonly id: string;
  readonly kind: MailboxKind;
  readonly address: MailAddress;
  readonly displayName: string;
  readonly permissions: readonly MailboxPermission[];
}

/** Aufgelöste Sende-Identität für die Header `From` (und optional `Sender`). */
export interface SenderIdentity {
  readonly from: MailAddress;
  readonly sender?: MailAddress;
}

export function hasPermission(mailbox: Mailbox, permission: MailboxPermission): boolean {
  return mailbox.permissions.includes(permission);
}

/** Darf aus diesem Postfach gesendet werden? (Primär immer; sonst SendAs oder SendOnBehalf.) */
export function canSend(mailbox: Mailbox): boolean {
  return (
    mailbox.kind === 'primary' ||
    hasPermission(mailbox, 'sendAs') ||
    hasPermission(mailbox, 'sendOnBehalf')
  );
}

/**
 * Bestimmt die Sende-Identität für das aktive Postfach.
 * - Primärpostfach → `from = primaryAddress`.
 * - SendAs → `from = mailbox.address` (kein `sender`).
 * - SendOnBehalf (ohne SendAs) → `from = mailbox.address`, `sender = primaryAddress`.
 * @throws Error wenn keine Sendeberechtigung besteht.
 */
export function resolveSenderIdentity(
  active: Mailbox,
  primaryAddress: MailAddress,
): SenderIdentity {
  if (active.kind === 'primary') {
    return { from: primaryAddress };
  }
  if (hasPermission(active, 'sendAs')) {
    return { from: active.address };
  }
  if (hasPermission(active, 'sendOnBehalf')) {
    return { from: active.address, sender: primaryAddress };
  }
  throw new Error(`Keine Sendeberechtigung für Postfach "${active.address.address}".`);
}
