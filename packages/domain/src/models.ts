import type { BodyType, FolderType, Importance, MessageFlag } from './enums';
import type { AccountId, ContactId, EventId, FolderId, MessageId } from './ids';

/** Eine E-Mail-Adresse mit optionalem Anzeigenamen. */
export interface MailAddress {
  readonly address: string;
  readonly displayName?: string;
}

export type RecipientKind = 'to' | 'cc' | 'bcc';

export interface Recipient {
  readonly kind: RecipientKind;
  readonly address: MailAddress;
}

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly isInline: boolean;
  readonly contentId?: string;
}

export interface MessageBody {
  readonly type: BodyType;
  readonly content: string;
}

export interface MailMessage {
  readonly id: MessageId;
  readonly accountId: AccountId;
  readonly folderId: FolderId;
  readonly conversationId?: string;
  readonly subject: string;
  readonly from: MailAddress;
  readonly recipients: readonly Recipient[];
  readonly receivedAt: number;
  readonly sentAt?: number;
  readonly importance: Importance;
  readonly flags: readonly MessageFlag[];
  readonly hasAttachments: boolean;
  readonly attachments: readonly Attachment[];
  readonly preview: string;
  readonly body?: MessageBody;
}

export interface MailFolder {
  readonly id: FolderId;
  readonly accountId: AccountId;
  readonly displayName: string;
  readonly type: FolderType;
  readonly parentId?: FolderId;
  readonly unreadCount: number;
  readonly totalCount: number;
}

export interface Account {
  readonly id: AccountId;
  readonly emailAddress: string;
  readonly displayName: string;
  readonly serverHost: string;
}

export interface Contact {
  readonly id: ContactId;
  readonly accountId: AccountId;
  readonly displayName: string;
  readonly emailAddresses: readonly MailAddress[];
  readonly company?: string;
}

export interface CalendarEvent {
  readonly id: EventId;
  readonly accountId: AccountId;
  readonly subject: string;
  readonly startAt: number;
  readonly endAt: number;
  readonly isAllDay: boolean;
  readonly location?: string;
  readonly organizer: MailAddress;
  readonly attendees: readonly MailAddress[];
}

/** Eine noch nicht versendete Nachricht (Composer-Ausgabe → Outbox). */
export interface OutgoingMessage {
  readonly subject: string;
  readonly body: MessageBody;
  readonly recipients: readonly Recipient[];
  readonly inReplyTo?: MessageId;
}
