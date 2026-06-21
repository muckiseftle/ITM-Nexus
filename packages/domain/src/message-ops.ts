import { MessageFlag } from './enums';
import type { MailMessage } from './models';

/** Reine, immutable Operationen auf {@link MailMessage} (Status/Flags). */

export function hasFlag(message: MailMessage, flag: MessageFlag): boolean {
  return message.flags.includes(flag);
}

export function isUnread(message: MailMessage): boolean {
  return !message.flags.includes(MessageFlag.Read);
}

/** Fügt ein Flag hinzu (idempotent: bereits gesetzte Flags lassen die Nachricht unverändert). */
export function withFlag(message: MailMessage, flag: MessageFlag): MailMessage {
  if (message.flags.includes(flag)) {
    return message;
  }
  return { ...message, flags: [...message.flags, flag] };
}

/** Entfernt ein Flag (idempotent). */
export function withoutFlag(message: MailMessage, flag: MessageFlag): MailMessage {
  if (!message.flags.includes(flag)) {
    return message;
  }
  return { ...message, flags: message.flags.filter((f) => f !== flag) };
}

/** Setzt/entfernt das Gelesen-Flag. */
export function markRead(message: MailMessage, read: boolean): MailMessage {
  return read ? withFlag(message, MessageFlag.Read) : withoutFlag(message, MessageFlag.Read);
}
