import type { MailMessage } from './models';

/** Farbpalette für Kategorien (analog zu den Outlook-Farbkategorien). */
export type CategoryColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

/** Definition einer Kategorie im Katalog (Name + Farbe). */
export interface CategoryDefinition {
  readonly name: string;
  readonly color: CategoryColor;
}

/** Reine, immutable Operationen auf den Kategorien einer {@link MailMessage}. */

export function hasCategory(message: MailMessage, name: string): boolean {
  return message.categories.includes(name);
}

/** Fügt eine Kategorie hinzu (idempotent). */
export function withCategory(message: MailMessage, name: string): MailMessage {
  if (message.categories.includes(name)) {
    return message;
  }
  return { ...message, categories: [...message.categories, name] };
}

/** Entfernt eine Kategorie (idempotent). */
export function withoutCategory(message: MailMessage, name: string): MailMessage {
  if (!message.categories.includes(name)) {
    return message;
  }
  return { ...message, categories: message.categories.filter((c) => c !== name) };
}
