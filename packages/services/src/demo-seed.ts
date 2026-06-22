import type { CalendarEvent, Contact, MailFolder, MailMessage } from '@nexus/domain';
import {
  BodyType,
  FolderType,
  Importance,
  MessageFlag,
  toAccountId,
  toContactId,
  toEventId,
  toFolderId,
  toMessageId,
} from '@nexus/domain';
import type { CalendarStore, ContactStore, FolderStore, MailStore } from '@nexus/core-transport';

/** Demo-Konto-ID, die App-Screens und Seed gemeinsam nutzen. */
export const DEMO_ACCOUNT = toAccountId('demo');
export const DEMO_INBOX = toFolderId('inbox');

const HOUR = 3_600_000;

function folder(id: string, name: string, type: FolderType, unread = 0): MailFolder {
  return {
    id: toFolderId(id),
    accountId: DEMO_ACCOUNT,
    displayName: name,
    type,
    unreadCount: unread,
    totalCount: 0,
  };
}

function message(params: {
  readonly id: string;
  readonly subject: string;
  readonly fromName: string;
  readonly fromAddress: string;
  readonly preview: string;
  readonly hoursAgo: number;
  readonly conversationId?: string;
  readonly read?: boolean;
  readonly flagged?: boolean;
  readonly categories?: readonly string[];
  readonly body?: string;
}): MailMessage {
  const flags = [
    ...(params.read === true ? [MessageFlag.Read] : []),
    ...(params.flagged === true ? [MessageFlag.Flagged] : []),
  ];
  return {
    id: toMessageId(params.id),
    accountId: DEMO_ACCOUNT,
    folderId: DEMO_INBOX,
    ...(params.conversationId !== undefined ? { conversationId: params.conversationId } : {}),
    subject: params.subject,
    from: { address: params.fromAddress, displayName: params.fromName },
    recipients: [{ kind: 'to', address: { address: 'demo@nexus.local' } }],
    receivedAt: Date.now() - params.hoursAgo * HOUR,
    importance: Importance.Normal,
    flags,
    categories: params.categories ?? [],
    hasAttachments: false,
    attachments: [],
    preview: params.preview,
    body: { type: BodyType.Text, content: params.body ?? params.preview },
  };
}

/** Beispiel-Inhalte für eine sofort erlebbare App (ohne Server). */
export interface DemoData {
  readonly folders: readonly MailFolder[];
  readonly messages: readonly MailMessage[];
  readonly contacts: readonly Contact[];
  readonly events: readonly CalendarEvent[];
}

export function buildDemoData(): DemoData {
  const folders: MailFolder[] = [
    folder('inbox', 'Posteingang', FolderType.Inbox, 3),
    folder('sent', 'Gesendet', FolderType.Sent),
    folder('drafts', 'Entwürfe', FolderType.Drafts),
    folder('archive', 'Archiv', FolderType.Archive),
  ];

  const messages: MailMessage[] = [
    message({
      id: 'm-100',
      subject: 'Angebot Q3 — Rückfrage',
      fromName: 'Markus Brandt',
      fromAddress: 'm.brandt@kunde.example.com',
      preview: 'Können wir die Konditionen aus dem Angebot noch einmal durchgehen?',
      hoursAgo: 1,
      conversationId: 'conv-angebot',
      categories: ['Vertrieb'],
      body: 'Hallo,\n\nkönnen wir die Konditionen aus dem Angebot Q3 noch einmal durchgehen? Insbesondere die Staffelpreise.\n\nViele Grüße\nMarkus Brandt',
    }),
    message({
      id: 'm-101',
      subject: 'Re: Angebot Q3 — Rückfrage',
      fromName: 'Sandra Keil',
      fromAddress: 's.keil@itm-technologies.de',
      preview: 'Anbei die aktualisierte Staffel. Passt der Termin am Donnerstag?',
      hoursAgo: 0.5,
      conversationId: 'conv-angebot',
      read: true,
    }),
    message({
      id: 'm-102',
      subject: 'Wartungsfenster Exchange am Wochenende',
      fromName: 'IT-Betrieb',
      fromAddress: 'it@itm-technologies.de',
      preview: 'Am Samstag von 22:00–02:00 Uhr ist ein Wartungsfenster geplant.',
      hoursAgo: 5,
      flagged: true,
      categories: ['Wichtig'],
    }),
    message({
      id: 'm-103',
      subject: 'NEXUS Newsletter — Juni',
      fromName: 'NEXUS News',
      fromAddress: 'news@itm-technologies.de',
      preview: 'Neuigkeiten rund um Ihre sichere Kommunikationsplattform.',
      hoursAgo: 26,
    }),
  ];

  const contacts: Contact[] = [
    {
      id: toContactId('c-1'),
      accountId: DEMO_ACCOUNT,
      displayName: 'Markus Brandt',
      emailAddresses: [{ address: 'm.brandt@kunde.example.com' }],
      company: 'Kunde GmbH',
    },
    {
      id: toContactId('c-2'),
      accountId: DEMO_ACCOUNT,
      displayName: 'Sandra Keil',
      emailAddresses: [{ address: 's.keil@itm-technologies.de' }],
      company: 'ITM Technologies',
    },
  ];

  const events: CalendarEvent[] = [
    {
      id: toEventId('e-1'),
      accountId: DEMO_ACCOUNT,
      subject: 'Abstimmung Angebot Q3',
      startAt: Date.now() + 2 * HOUR,
      endAt: Date.now() + 3 * HOUR,
      isAllDay: false,
      location: 'Teams',
      organizer: { address: 's.keil@itm-technologies.de', displayName: 'Sandra Keil' },
      attendees: [{ address: 'm.brandt@kunde.example.com' }],
    },
  ];

  return { folders, messages, contacts, events };
}

/** Schreibt die Demo-Daten in die übergebenen In-Memory-Stores. */
export async function seedDemoData(stores: {
  readonly mailStore: MailStore;
  readonly folderStore: FolderStore;
  readonly contactStore: ContactStore;
  readonly calendarStore: CalendarStore;
}): Promise<void> {
  const data = buildDemoData();
  await stores.folderStore.upsertFolders(data.folders);
  await stores.mailStore.upsertMessages(data.messages);
  await stores.contactStore.upsertContacts(data.contacts);
  await stores.calendarStore.upsertEvents(data.events);
}
