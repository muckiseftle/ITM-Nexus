/**
 * Aufzählungstypen als `const`-Objekte + abgeleitete Union-Typen.
 * Bewusst keine TS-`enum`s (Tree-Shaking, `verbatimModuleSyntax`, klarere JS-Ausgabe).
 */

export const FolderType = {
  Inbox: 'inbox',
  Sent: 'sent',
  Drafts: 'drafts',
  Deleted: 'deleted',
  Junk: 'junk',
  Archive: 'archive',
  Outbox: 'outbox',
  Custom: 'custom',
} as const;
export type FolderType = (typeof FolderType)[keyof typeof FolderType];

export const MessageFlag = {
  Read: 'read',
  Flagged: 'flagged',
  Answered: 'answered',
  Forwarded: 'forwarded',
  Draft: 'draft',
} as const;
export type MessageFlag = (typeof MessageFlag)[keyof typeof MessageFlag];

export const Importance = {
  Low: 'low',
  Normal: 'normal',
  High: 'high',
} as const;
export type Importance = (typeof Importance)[keyof typeof Importance];

export const BodyType = {
  Text: 'text',
  Html: 'html',
} as const;
export type BodyType = (typeof BodyType)[keyof typeof BodyType];
