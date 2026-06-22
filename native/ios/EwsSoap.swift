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
