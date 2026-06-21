import { describe, expect, it } from 'vitest';
import { createMailAddress } from './mail-address';
import type { Mailbox, MailboxPermission } from './mailbox';
import { canSend, hasPermission, resolveSenderIdentity } from './mailbox';

const primaryAddress = createMailAddress('assistenz@example.com');
const bossAddress = createMailAddress('vorstand@example.com');

function mailbox(kind: Mailbox['kind'], permissions: MailboxPermission[]): Mailbox {
  return {
    id: kind === 'primary' ? 'me' : 'boss',
    kind,
    address: kind === 'primary' ? primaryAddress : bossAddress,
    displayName: kind === 'primary' ? 'Ich' : 'Vorstand',
    permissions,
  };
}

describe('Mailbox-Berechtigungen', () => {
  it('hasPermission / canSend', () => {
    expect(hasPermission(mailbox('shared', ['read']), 'read')).toBe(true);
    expect(canSend(mailbox('primary', []))).toBe(true);
    expect(canSend(mailbox('shared', ['sendAs']))).toBe(true);
    expect(canSend(mailbox('shared', ['sendOnBehalf']))).toBe(true);
    expect(canSend(mailbox('shared', ['read']))).toBe(false);
  });
});

describe('resolveSenderIdentity', () => {
  it('Primärpostfach → from = Primäradresse, kein sender', () => {
    const id = resolveSenderIdentity(mailbox('primary', []), primaryAddress);
    expect(id.from.address).toBe('assistenz@example.com');
    expect(id.sender).toBeUndefined();
  });

  it('SendAs → from = Postfach, kein sender', () => {
    const id = resolveSenderIdentity(mailbox('shared', ['sendAs']), primaryAddress);
    expect(id.from.address).toBe('vorstand@example.com');
    expect(id.sender).toBeUndefined();
  });

  it('SendOnBehalf → from = Postfach, sender = Primäradresse', () => {
    const id = resolveSenderIdentity(mailbox('delegated', ['sendOnBehalf']), primaryAddress);
    expect(id.from.address).toBe('vorstand@example.com');
    expect(id.sender?.address).toBe('assistenz@example.com');
  });

  it('SendAs hat Vorrang vor SendOnBehalf', () => {
    const id = resolveSenderIdentity(
      mailbox('delegated', ['sendOnBehalf', 'sendAs']),
      primaryAddress,
    );
    expect(id.sender).toBeUndefined();
  });

  it('wirft ohne Sendeberechtigung', () => {
    expect(() => resolveSenderIdentity(mailbox('shared', ['read']), primaryAddress)).toThrow(
      /Keine Sendeberechtigung/,
    );
  });
});
