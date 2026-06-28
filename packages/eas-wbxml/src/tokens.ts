/**
 * EAS WBXML Code-Pages und Tag-Tokens nach [MS-ASWBXML].
 *
 * WICHTIG: Die Code-Page-NUMMERN sind die offiziellen MS-ASWBXML-Zuordnungen — nicht raten.
 * Häufige Verwechslungen: AirSyncBase = 17 (nicht 12), Provision = 14, Ping = 13,
 * ItemOperations = 20, Search = 15. Diese Tabelle ist die Referenz, an der der Swift-Codec
 * (native/ios/Wbxml.swift) 1:1 ausgerichtet wird.
 *
 * Die Tag-Tokens sind die 6-Bit-Basiswerte OHNE Flags. Der Encoder ODER-t bei Inhalt 0x40
 * (Content-Flag) dazu; Attribute (0x80) nutzt EAS nicht.
 */

/** Offizielle MS-ASWBXML-Code-Page-Nummern. */
export const PAGE = {
  AirSync: 0,
  Contacts: 1,
  Email: 2,
  Calendar: 4,
  Move: 5,
  GetItemEstimate: 6,
  FolderHierarchy: 7,
  MeetingResponse: 8,
  Tasks: 9,
  Ping: 13,
  Provision: 14,
  Search: 15,
  Gal: 16,
  AirSyncBase: 17,
  Settings: 18,
  ItemOperations: 20,
  ComposeMail: 21,
  Email2: 22,
} as const;

export type PageName = keyof typeof PAGE;

/**
 * Tag-Tokens je Code-Page. Bewusst nur die Tags, die NEXUS zum Bauen von Requests braucht —
 * der Decoder ist namensunabhängig (liefert {page, token} numerisch), das Mapping auf Felder
 * passiert serverseitig im nativen Parser. Tokens hier sind gegen [MS-ASWBXML] geprüft.
 */
const TAGS_BY_PAGE: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  // Code Page 0 — AirSync ([MS-ASWBXML] 2.1.2.1.1 / 2.1.2.1.20 für 14.x)
  [PAGE.AirSync]: {
    Sync: 0x05,
    Responses: 0x06,
    Add: 0x07,
    Change: 0x08,
    Delete: 0x09,
    Fetch: 0x0a,
    SyncKey: 0x0b,
    ClientId: 0x0c,
    ServerId: 0x0d,
    Status: 0x0e,
    Collection: 0x0f,
    Class: 0x10,
    CollectionId: 0x12,
    GetChanges: 0x13,
    MoreAvailable: 0x14,
    WindowSize: 0x15,
    Commands: 0x16,
    Options: 0x17,
    FilterType: 0x18,
    Conflict: 0x1b,
    Collections: 0x1c,
    ApplicationData: 0x1d,
    DeletesAsMoves: 0x1e,
    Supported: 0x20,
    SoftDelete: 0x21,
    MIMESupport: 0x22,
    MIMETruncation: 0x23,
    Wait: 0x24,
    Limit: 0x25,
    Partial: 0x26,
    ConversationMode: 0x27,
    MaxItems: 0x28,
    HeartbeatInterval: 0x29,
  },
  // Code Page 2 — Email (Kernfelder, [MS-ASWBXML] 2.1.2.1.3)
  [PAGE.Email]: {
    Attachment: 0x05,
    Attachments: 0x06,
    AttName: 0x07,
    AttSize: 0x08,
    Att0Id: 0x09,
    AttMethod: 0x0a,
    AttRemoved: 0x0b,
    Body: 0x0c,
    BodySize: 0x0d,
    BodyTruncated: 0x0e,
    DateReceived: 0x0f,
    DisplayName: 0x10,
    DisplayTo: 0x11,
    Importance: 0x12,
    MessageClass: 0x13,
    Subject: 0x14,
    Read: 0x15,
    To: 0x16,
    Cc: 0x17,
    From: 0x18,
    ReplyTo: 0x19,
    Categories: 0x1b,
    Category: 0x1c,
    ThreadTopic: 0x35,
    MIMEData: 0x36,
    MIMETruncated: 0x37,
    MIMESize: 0x38,
    InternetCPID: 0x39,
    Flag: 0x3a,
    FlagStatus: 0x3b,
    ContentClass: 0x3c,
    FlagType: 0x3d,
    CompleteTime: 0x3e,
  },
  // Code Page 5 — Move ([MS-ASWBXML] 2.1.2.1.6)
  [PAGE.Move]: {
    MoveItems: 0x05,
    Move: 0x06,
    SrcMsgId: 0x07,
    SrcFldId: 0x08,
    DstFldId: 0x09,
    Response: 0x0a,
    Status: 0x0b,
    DstMsgId: 0x0c,
  },
  // Code Page 7 — FolderHierarchy ([MS-ASWBXML] 2.1.2.1.8)
  [PAGE.FolderHierarchy]: {
    DisplayName: 0x07,
    ServerId: 0x08,
    ParentId: 0x09,
    Type: 0x0a,
    Status: 0x0c,
    Changes: 0x0e,
    Add: 0x0f,
    Delete: 0x10,
    Update: 0x11,
    SyncKey: 0x12,
    FolderCreate: 0x13,
    FolderDelete: 0x14,
    FolderUpdate: 0x15,
    FolderSync: 0x16,
    Count: 0x17,
  },
  // Code Page 8 — MeetingResponse ([MS-ASWBXML] 2.1.2.1.9)
  [PAGE.MeetingResponse]: {
    CalendarId: 0x05,
    CollectionId: 0x06,
    MeetingResponse: 0x07,
    RequestId: 0x08,
    Request: 0x09,
    Result: 0x0a,
    Status: 0x0b,
    UserResponse: 0x0c,
  },
  // Code Page 13 — Ping ([MS-ASWBXML] 2.1.2.1.14)
  [PAGE.Ping]: {
    Ping: 0x05,
    Status: 0x07,
    HeartbeatInterval: 0x08,
    Folders: 0x09,
    Folder: 0x0a,
    Id: 0x0b,
    Class: 0x0c,
    MaxFolders: 0x0d,
  },
  // Code Page 14 — Provision ([MS-ASWBXML] 2.1.2.1.15)
  [PAGE.Provision]: {
    Provision: 0x05,
    Policies: 0x06,
    Policy: 0x07,
    PolicyType: 0x08,
    PolicyKey: 0x09,
    Data: 0x0a,
    Status: 0x0b,
    RemoteWipe: 0x0c,
    EASProvisionDoc: 0x0d,
  },
  // Code Page 15 — Search ([MS-ASWBXML] 2.1.2.1.16)
  [PAGE.Search]: {
    Search: 0x05,
    Store: 0x07,
    Name: 0x08,
    Query: 0x09,
    Options: 0x0a,
    Range: 0x0b,
    Status: 0x0c,
    Response: 0x0d,
    Result: 0x0e,
    Properties: 0x0f,
    Total: 0x10,
    EqualTo: 0x11,
    Value: 0x12,
    And: 0x13,
    Or: 0x14,
    FreeText: 0x15,
    DeepTraversal: 0x17,
    LongId: 0x18,
    RebuildResults: 0x19,
    LessThan: 0x1a,
    GreaterThan: 0x1b,
    UserName: 0x1e,
    Password: 0x1f,
    ConversationId: 0x20,
    Picture: 0x21,
    MaxSize: 0x22,
    MaxPictures: 0x23,
  },
  // Code Page 17 — AirSyncBase ([MS-ASWBXML] 2.1.2.1.18)
  [PAGE.AirSyncBase]: {
    BodyPreference: 0x05,
    Type: 0x06,
    TruncationSize: 0x07,
    AllOrNone: 0x08,
    Body: 0x0a,
    Data: 0x0b,
    EstimatedDataSize: 0x0c,
    Truncated: 0x0d,
    Attachments: 0x0e,
    Attachment: 0x0f,
    DisplayName: 0x10,
    FileReference: 0x11,
    Method: 0x12,
    ContentId: 0x13,
    ContentLocation: 0x14,
    IsInline: 0x15,
    NativeBodyType: 0x16,
    ContentType: 0x17,
    Preview: 0x18,
    BodyPartPreference: 0x19,
    BodyPart: 0x1a,
    Status: 0x1b,
  },
  // Code Page 21 — ComposeMail ([MS-ASWBXML] 2.1.2.1.22) — SendMail/SmartForward/SmartReply
  [PAGE.ComposeMail]: {
    SendMail: 0x05,
    SmartForward: 0x06,
    SmartReply: 0x07,
    SaveInSentItems: 0x08,
    ReplaceMime: 0x09,
    Source: 0x0b,
    FolderId: 0x0c,
    ItemId: 0x0d,
    LongId: 0x0e,
    InstanceId: 0x0f,
    Mime: 0x10,
    ClientId: 0x11,
    Status: 0x12,
    AccountId: 0x13,
  },
  // Code Page 20 — ItemOperations ([MS-ASWBXML] 2.1.2.1.21)
  [PAGE.ItemOperations]: {
    ItemOperations: 0x05,
    Fetch: 0x06,
    Store: 0x07,
    Options: 0x08,
    Range: 0x09,
    Total: 0x0a,
    Properties: 0x0b,
    Data: 0x0c,
    Status: 0x0d,
    Response: 0x0e,
    Version: 0x0f,
    Schema: 0x10,
    Part: 0x11,
    EmptyFolderContents: 0x12,
    DeleteSubFolders: 0x13,
    UserName: 0x14,
    Password: 0x15,
    Move: 0x16,
    DstFldId: 0x17,
    ConversationId: 0x18,
    MoveAlways: 0x19,
  },
};

/** page-Nummer → (tagName → token). */
export const TAGS = TAGS_BY_PAGE;

/** Token-Wert für (Page, Tag) auflösen; wirft bei unbekanntem Tag (Schutz vor Tippfehlern). */
export function tagToken(page: PageName, tag: string): number {
  const table = TAGS_BY_PAGE[PAGE[page]];
  const token = table?.[tag];
  if (token === undefined) {
    throw new Error(`Unbekanntes EAS-Tag "${tag}" in Code-Page ${page}`);
  }
  return token;
}
