import Foundation

/// Bau von EWS-SOAP-Envelopes und Parsing der relevanten Antwortfelder.
///
/// Die Envelope-Templates sind vollständig; das Response-Parsing deckt die für das
/// Domänenmodell (`MailMessage`) nötigen Kernfelder ab und wird on-device gehärtet
/// (Namespaces/Edge-Cases). Siehe docs/11-Native-und-App.md.
enum EwsSoap {
  static let messagesNS = "http://schemas.microsoft.com/exchange/services/2006/messages"
  static let typesNS = "http://schemas.microsoft.com/exchange/services/2006/types"

  private static func envelope(_ body: String) -> String {
    """
    <?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
                   xmlns:m="\(messagesNS)" xmlns:t="\(typesNS)">
      <soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>
      <soap:Body>\(body)</soap:Body>
    </soap:Envelope>
    """
  }

  static func xmlEscape(_ s: String) -> String {
    s.replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
  }

  // MARK: Request-Envelopes

  static func syncFolderItems(folderId: String, syncState: String?) -> String {
    let state = syncState.map { "<m:SyncState>\(xmlEscape($0))</m:SyncState>" } ?? ""
    return envelope("""
      <m:SyncFolderItems>
        <m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>
        <m:SyncFolderId><t:DistinguishedFolderId Id="\(xmlEscape(folderId))"/></m:SyncFolderId>
        \(state)
        <m:MaxChangesReturned>100</m:MaxChangesReturned>
      </m:SyncFolderItems>
    """)
  }

  static func getItems(ids: [String]) -> String {
    let refs = ids.map { "<t:ItemId Id=\"\(xmlEscape($0))\"/>" }.joined()
    return envelope("""
      <m:GetItem>
        <m:ItemShape>
          <t:BaseShape>Default</t:BaseShape>
          <t:BodyType>Text</t:BodyType>
        </m:ItemShape>
        <m:ItemIds>\(refs)</m:ItemIds>
      </m:GetItem>
    """)
  }

  static func createItem(from: String, sender: String?, to: [String], subject: String, body: String) -> String {
    let recipients = to.map { "<t:Mailbox><t:EmailAddress>\(xmlEscape($0))</t:EmailAddress></t:Mailbox>" }.joined()
    let senderXml = sender.map { "<t:Sender><t:Mailbox><t:EmailAddress>\(xmlEscape($0))</t:EmailAddress></t:Mailbox></t:Sender>" } ?? ""
    return envelope("""
      <m:CreateItem MessageDisposition="SendAndSaveCopy">
        <m:Items>
          <t:Message>
            <t:Subject>\(xmlEscape(subject))</t:Subject>
            <t:Body BodyType="Text">\(xmlEscape(body))</t:Body>
            <t:ToRecipients>\(recipients)</t:ToRecipients>
            \(senderXml)
            <t:From><t:Mailbox><t:EmailAddress>\(xmlEscape(from))</t:EmailAddress></t:Mailbox></t:From>
          </t:Message>
        </m:Items>
      </m:CreateItem>
    """)
  }

  static func setIsRead(itemId: String, isRead: Bool) -> String {
    envelope("""
      <m:UpdateItem ConflictResolution="AutoResolve" MessageDisposition="SaveOnly">
        <m:ItemChanges>
          <t:ItemChange>
            <t:ItemId Id="\(xmlEscape(itemId))"/>
            <t:Updates>
              <t:SetItemField>
                <t:FieldURI FieldURI="message:IsRead"/>
                <t:Message><t:IsRead>\(isRead ? "true" : "false")</t:IsRead></t:Message>
              </t:SetItemField>
            </t:Updates>
          </t:ItemChange>
        </m:ItemChanges>
      </m:UpdateItem>
    """)
  }

  static func moveItem(itemId: String, toFolderId: String) -> String {
    envelope("""
      <m:MoveItem>
        <m:ToFolderId><t:DistinguishedFolderId Id="\(xmlEscape(toFolderId))"/></m:ToFolderId>
        <m:ItemIds><t:ItemId Id="\(xmlEscape(itemId))"/></m:ItemIds>
      </m:MoveItem>
    """)
  }

  static func deleteItem(itemId: String) -> String {
    envelope("""
      <m:DeleteItem DeleteType="MoveToDeletedItems">
        <m:ItemIds><t:ItemId Id="\(xmlEscape(itemId))"/></m:ItemIds>
      </m:DeleteItem>
    """)
  }

  static func findItem(folderId: String, query: String) -> String {
    envelope("""
      <m:FindItem Traversal="Shallow">
        <m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>
        <m:ParentFolderIds><t:DistinguishedFolderId Id="\(xmlEscape(folderId))"/></m:ParentFolderIds>
        <m:QueryString>\(xmlEscape(query))</m:QueryString>
      </m:FindItem>
    """)
  }

  static func setFlag(itemId: String, flagged: Bool) -> String {
    let status = flagged ? "Flagged" : "NotFlagged"
    return envelope("""
      <m:UpdateItem ConflictResolution="AutoResolve" MessageDisposition="SaveOnly">
        <m:ItemChanges><t:ItemChange>
          <t:ItemId Id="\(xmlEscape(itemId))"/>
          <t:Updates><t:SetItemField>
            <t:FieldURI FieldURI="item:Flag"/>
            <t:Item><t:Flag><t:FlagStatus>\(status)</t:FlagStatus></t:Flag></t:Item>
          </t:SetItemField></t:Updates>
        </t:ItemChange></m:ItemChanges>
      </m:UpdateItem>
    """)
  }

  static func setCategories(itemId: String, categories: [String]) -> String {
    let strings = categories.map { "<t:String>\(xmlEscape($0))</t:String>" }.joined()
    return envelope("""
      <m:UpdateItem ConflictResolution="AutoResolve" MessageDisposition="SaveOnly">
        <m:ItemChanges><t:ItemChange>
          <t:ItemId Id="\(xmlEscape(itemId))"/>
          <t:Updates><t:SetItemField>
            <t:FieldURI FieldURI="item:Categories"/>
            <t:Item><t:Categories>\(strings)</t:Categories></t:Item>
          </t:SetItemField></t:Updates>
        </t:ItemChange></m:ItemChanges>
      </m:UpdateItem>
    """)
  }

  static func findFolders() -> String {
    envelope("""
      <m:FindFolder Traversal="Deep">
        <m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>
        <m:ParentFolderIds><t:DistinguishedFolderId Id="msgfolderroot"/></m:ParentFolderIds>
      </m:FindFolder>
    """)
  }

  static func syncFolderItemsIdOnly(distinguished: String, syncState: String?) -> String {
    syncFolderItems(folderId: distinguished, syncState: syncState)
  }

  // MARK: weitere Parser

  struct ParsedFolder {
    var id = ""
    var displayName = ""
    var unread = 0
    var total = 0
  }

  static func parseFolders(_ xml: Data) -> [ParsedFolder] {
    let parser = FolderParser()
    let xmlParser = XMLParser(data: xml)
    xmlParser.delegate = parser
    xmlParser.parse()
    return parser.folders
  }

  struct ParsedEvent {
    var id = ""
    var subject = ""
    var start: Double = 0
    var end: Double = 0
    var location = ""
    var organizer = ""
  }

  static func parseEvents(_ xml: Data) -> [ParsedEvent] {
    let parser = EventParser()
    let xmlParser = XMLParser(data: xml)
    xmlParser.delegate = parser
    xmlParser.parse()
    return parser.events
  }

  struct ParsedContact {
    var id = ""
    var displayName = ""
    var email = ""
  }

  static func parseContacts(_ xml: Data) -> [ParsedContact] {
    let parser = ContactParser()
    let xmlParser = XMLParser(data: xml)
    xmlParser.delegate = parser
    xmlParser.parse()
    return parser.contacts
  }

  static func iso(_ s: String) -> Double {
    (ISO8601DateFormatter().date(from: s)?.timeIntervalSince1970 ?? 0) * 1000
  }

  // MARK: Response-Parsing (Kernfelder)

  struct ParsedItem {
    var id = ""
    var subject = ""
    var fromName = ""
    var fromAddress = ""
    var receivedAt: Double = 0
    var isRead = false
    var preview = ""
  }

  /// Extrahiert `ItemId`-Werte aus einer SyncFolderItems/FindItem-Antwort.
  static func extractItemIds(_ xml: Data) -> [String] {
    let parser = ItemIdParser()
    let xmlParser = XMLParser(data: xml)
    xmlParser.delegate = parser
    xmlParser.parse()
    return parser.ids
  }

  /// Parst eine GetItem-Antwort in `ParsedItem`s.
  static func parseItems(_ xml: Data) -> [ParsedItem] {
    let parser = ItemParser()
    let xmlParser = XMLParser(data: xml)
    xmlParser.delegate = parser
    xmlParser.parse()
    return parser.items
  }
}

/// Sammelt `<t:ItemId Id="...">`-Attribute.
private final class ItemIdParser: NSObject, XMLParserDelegate {
  var ids: [String] = []
  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    if name == "ItemId", let id = attrs["Id"] { ids.append(id) }
  }
}

/// Minimaler GetItem-Parser für die Domänen-Kernfelder.
private final class ItemParser: NSObject, XMLParserDelegate {
  var items: [EwsSoap.ParsedItem] = []
  private var current: EwsSoap.ParsedItem?
  private var path: [String] = []
  private var text = ""

  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    path.append(name)
    text = ""
    if name == "Message" || name == "Item" { current = EwsSoap.ParsedItem() }
    if name == "ItemId", let id = attrs["Id"] { current?.id = id }
  }

  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }

  func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?,
              qualifiedName: String?) {
    switch name {
    case "Subject": current?.subject = text
    case "Name": current?.fromName = text
    case "EmailAddress": current?.fromAddress = text
    case "DateTimeReceived":
      let fmt = ISO8601DateFormatter()
      current?.receivedAt = (fmt.date(from: text)?.timeIntervalSince1970 ?? 0) * 1000
    case "IsRead": current?.isRead = (text == "true")
    case "Body": if current?.preview.isEmpty == true { current?.preview = String(text.prefix(140)) }
    case "Message", "Item": if let item = current { items.append(item); current = nil }
    default: break
    }
    path.removeLast()
    text = ""
  }
}

/// Parser für FindFolder-Antworten (Ordner).
private final class FolderParser: NSObject, XMLParserDelegate {
  var folders: [EwsSoap.ParsedFolder] = []
  private var current: EwsSoap.ParsedFolder?
  private var text = ""

  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    text = ""
    if name == "Folder" { current = EwsSoap.ParsedFolder() }
    if name == "FolderId", let id = attrs["Id"] { current?.id = id }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }
  func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
    switch name {
    case "DisplayName": current?.displayName = text
    case "UnreadCount": current?.unread = Int(text) ?? 0
    case "TotalCount": current?.total = Int(text) ?? 0
    case "Folder": if let f = current { folders.append(f); current = nil }
    default: break
    }
    text = ""
  }
}

/// Parser für CalendarItem-Antworten (Termine).
private final class EventParser: NSObject, XMLParserDelegate {
  var events: [EwsSoap.ParsedEvent] = []
  private var current: EwsSoap.ParsedEvent?
  private var text = ""

  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    text = ""
    if name == "CalendarItem" { current = EwsSoap.ParsedEvent() }
    if name == "ItemId", let id = attrs["Id"] { current?.id = id }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }
  func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
    switch name {
    case "Subject": current?.subject = text
    case "Start": current?.start = EwsSoap.iso(text)
    case "End": current?.end = EwsSoap.iso(text)
    case "Location": current?.location = text
    case "Name": if current?.organizer.isEmpty == true { current?.organizer = text }
    case "CalendarItem": if let e = current { events.append(e); current = nil }
    default: break
    }
    text = ""
  }
}

/// Parser für Contact-Antworten (Kontakte).
private final class ContactParser: NSObject, XMLParserDelegate {
  var contacts: [EwsSoap.ParsedContact] = []
  private var current: EwsSoap.ParsedContact?
  private var text = ""

  func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
              qualifiedName: String?, attributes attrs: [String: String]) {
    text = ""
    if name == "Contact" { current = EwsSoap.ParsedContact() }
    if name == "ItemId", let id = attrs["Id"] { current?.id = id }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }
  func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
    switch name {
    case "DisplayName": current?.displayName = text
    case "Entry": if current?.email.isEmpty == true { current?.email = text }
    case "Contact": if let c = current { contacts.append(c); current = nil }
    default: break
    }
    text = ""
  }
}
