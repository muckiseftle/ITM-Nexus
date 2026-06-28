import Foundation

/// EAS WBXML-1.3-Codec — 1:1-Transkription von `packages/eas-wbxml` (TypeScript-Referenz).
///
/// Reines Byte-Handling in Swift, KEINE ObjC-APIs → keine NSException-Gefahr (anders als
/// `JSONSerialization`). Die Byte-Korrektheit ist in der Node-CI über Byte-Vektor-Tests
/// (`packages/eas-wbxml/src/wbxml.test.ts`) bewiesen; dies hier ist die native Entsprechung,
/// gegen die TS-Referenz Zeile für Zeile abgeglichen.
///
/// WBXML-Aufbau (EAS, ohne Attribute/String-Tabelle):
///   Header: version(0x03) | publicid(mb-uint=1) | charset(mb-uint=0x6A UTF-8) | strTblLen(0)
///   Tags:   token|0x40 bei Inhalt, danach Inhalt, dann END(0x01); leeres Tag = token allein.
///   Global: SWITCH_PAGE(0x00,page) · END(0x01) · STR_I(0x03 … 0x00) · OPAQUE(0xC3,mb-uint,bytes)
enum Wbxml {

  enum WbxmlError: Error { case empty, truncated, badStructure }

  /// Offizielle MS-ASWBXML-Code-Page-Nummern.
  enum Page {
    static let airSync = 0
    static let contacts = 1
    static let email = 2
    static let calendar = 4
    static let move = 5
    static let getItemEstimate = 6
    static let folderHierarchy = 7
    static let meetingResponse = 8
    static let tasks = 9
    static let ping = 13
    static let provision = 14
    static let search = 15
    static let gal = 16
    static let airSyncBase = 17
    static let settings = 18
    static let itemOperations = 20
    static let email2 = 22
  }

  // MARK: Tag-Tokens je Page (Basiswerte ohne Flags) — exakt wie tokens.ts

  private static let airSyncTags: [String: UInt8] = [
    "Sync": 0x05, "Responses": 0x06, "Add": 0x07, "Change": 0x08, "Delete": 0x09, "Fetch": 0x0a,
    "SyncKey": 0x0b, "ClientId": 0x0c, "ServerId": 0x0d, "Status": 0x0e, "Collection": 0x0f,
    "Class": 0x10, "CollectionId": 0x12, "GetChanges": 0x13, "MoreAvailable": 0x14,
    "WindowSize": 0x15, "Commands": 0x16, "Options": 0x17, "FilterType": 0x18, "Conflict": 0x1b,
    "Collections": 0x1c, "ApplicationData": 0x1d, "DeletesAsMoves": 0x1e, "Supported": 0x20,
    "SoftDelete": 0x21, "MIMESupport": 0x22, "MIMETruncation": 0x23, "Wait": 0x24, "Limit": 0x25,
    "Partial": 0x26, "ConversationMode": 0x27, "MaxItems": 0x28, "HeartbeatInterval": 0x29,
  ]

  private static let emailTags: [String: UInt8] = [
    "Attachment": 0x05, "Attachments": 0x06, "AttName": 0x07, "AttSize": 0x08, "Att0Id": 0x09,
    "AttMethod": 0x0a, "AttRemoved": 0x0b, "Body": 0x0c, "BodySize": 0x0d, "BodyTruncated": 0x0e,
    "DateReceived": 0x0f, "DisplayName": 0x10, "DisplayTo": 0x11, "Importance": 0x12,
    "MessageClass": 0x13, "Subject": 0x14, "Read": 0x15, "To": 0x16, "Cc": 0x17, "From": 0x18,
    "ReplyTo": 0x19, "Categories": 0x1b, "Category": 0x1c, "ThreadTopic": 0x35, "MIMEData": 0x36,
    "MIMETruncated": 0x37, "MIMESize": 0x38, "InternetCPID": 0x39, "Flag": 0x3a, "FlagStatus": 0x3b,
    "ContentClass": 0x3c, "FlagType": 0x3d, "CompleteTime": 0x3e,
  ]

  private static let moveTags: [String: UInt8] = [
    "MoveItems": 0x05, "Move": 0x06, "SrcMsgId": 0x07, "SrcFldId": 0x08, "DstFldId": 0x09,
    "Response": 0x0a, "Status": 0x0b, "DstMsgId": 0x0c,
  ]

  private static let folderTags: [String: UInt8] = [
    "DisplayName": 0x07, "ServerId": 0x08, "ParentId": 0x09, "Type": 0x0a, "Status": 0x0c,
    "Changes": 0x0e, "Add": 0x0f, "Delete": 0x10, "Update": 0x11, "SyncKey": 0x12,
    "FolderCreate": 0x13, "FolderDelete": 0x14, "FolderUpdate": 0x15, "FolderSync": 0x16,
    "Count": 0x17,
  ]

  private static let meetingResponseTags: [String: UInt8] = [
    "CalendarId": 0x05, "CollectionId": 0x06, "MeetingResponse": 0x07, "RequestId": 0x08,
    "Request": 0x09, "Result": 0x0a, "Status": 0x0b, "UserResponse": 0x0c,
  ]

  private static let pingTags: [String: UInt8] = [
    "Ping": 0x05, "Status": 0x07, "HeartbeatInterval": 0x08, "Folders": 0x09, "Folder": 0x0a,
    "Id": 0x0b, "Class": 0x0c, "MaxFolders": 0x0d,
  ]

  private static let provisionTags: [String: UInt8] = [
    "Provision": 0x05, "Policies": 0x06, "Policy": 0x07, "PolicyType": 0x08, "PolicyKey": 0x09,
    "Data": 0x0a, "Status": 0x0b, "RemoteWipe": 0x0c, "EASProvisionDoc": 0x0d,
  ]

  private static let searchTags: [String: UInt8] = [
    "Search": 0x05, "Store": 0x07, "Name": 0x08, "Query": 0x09, "Options": 0x0a, "Range": 0x0b,
    "Status": 0x0c, "Response": 0x0d, "Result": 0x0e, "Properties": 0x0f, "Total": 0x10,
    "EqualTo": 0x11, "Value": 0x12, "And": 0x13, "Or": 0x14, "FreeText": 0x15, "DeepTraversal": 0x17,
    "LongId": 0x18, "RebuildResults": 0x19, "LessThan": 0x1a, "GreaterThan": 0x1b, "UserName": 0x1e,
    "Password": 0x1f, "ConversationId": 0x20, "Picture": 0x21, "MaxSize": 0x22, "MaxPictures": 0x23,
  ]

  private static let airSyncBaseTags: [String: UInt8] = [
    "BodyPreference": 0x05, "Type": 0x06, "TruncationSize": 0x07, "AllOrNone": 0x08, "Body": 0x0a,
    "Data": 0x0b, "EstimatedDataSize": 0x0c, "Truncated": 0x0d, "Attachments": 0x0e,
    "Attachment": 0x0f, "DisplayName": 0x10, "FileReference": 0x11, "Method": 0x12,
    "ContentId": 0x13, "ContentLocation": 0x14, "IsInline": 0x15, "NativeBodyType": 0x16,
    "ContentType": 0x17, "Preview": 0x18, "BodyPartPreference": 0x19, "BodyPart": 0x1a,
    "Status": 0x1b,
  ]

  private static let itemOpsTags: [String: UInt8] = [
    "ItemOperations": 0x05, "Fetch": 0x06, "Store": 0x07, "Options": 0x08, "Range": 0x09,
    "Total": 0x0a, "Properties": 0x0b, "Data": 0x0c, "Status": 0x0d, "Response": 0x0e,
    "Version": 0x0f, "Schema": 0x10, "Part": 0x11, "EmptyFolderContents": 0x12,
    "DeleteSubFolders": 0x13, "UserName": 0x14, "Password": 0x15, "Move": 0x16, "DstFldId": 0x17,
    "ConversationId": 0x18, "MoveAlways": 0x19,
  ]

  static let tags: [Int: [String: UInt8]] = [
    Page.airSync: airSyncTags,
    Page.email: emailTags,
    Page.move: moveTags,
    Page.folderHierarchy: folderTags,
    Page.meetingResponse: meetingResponseTags,
    Page.ping: pingTags,
    Page.provision: provisionTags,
    Page.search: searchTags,
    Page.airSyncBase: airSyncBaseTags,
    Page.itemOperations: itemOpsTags,
  ]

  // MARK: Node-Modell + Builder

  final class Node {
    let page: Int
    let token: UInt8
    var text: String?
    var opaque: [UInt8]?
    var children: [Node]
    init(page: Int, token: UInt8, text: String? = nil, opaque: [UInt8]? = nil, children: [Node] = [])
    {
      self.page = page
      self.token = token
      self.text = text
      self.opaque = opaque
      self.children = children
    }
  }

  private static func requireToken(_ page: Int, _ tag: String) -> UInt8 {
    guard let t = tags[page]?[tag] else {
      assertionFailure("Unbekanntes EAS-Tag \(tag) in Code-Page \(page)")
      return 0
    }
    return t
  }

  static func el(_ page: Int, _ tag: String, _ children: [Node] = []) -> Node {
    Node(page: page, token: requireToken(page, tag), children: children)
  }

  static func txt(_ page: Int, _ tag: String, _ text: String) -> Node {
    Node(page: page, token: requireToken(page, tag), text: text)
  }

  static func bin(_ page: Int, _ tag: String, _ data: [UInt8]) -> Node {
    Node(page: page, token: requireToken(page, tag), opaque: data)
  }

  // MARK: Multi-Byte-UInt (mb_u_int32)

  static func encodeMbUInt(_ value: Int) -> [UInt8] {
    precondition(value >= 0, "mb-uint: nur nicht-negative Werte")
    var groups: [UInt8] = [UInt8(value & 0x7f)]
    var n = value >> 7
    while n > 0 {
      groups.insert(UInt8((n & 0x7f) | 0x80), at: 0)
      n >>= 7
    }
    return groups
  }

  static func decodeMbUInt(_ data: [UInt8], _ i: inout Int) throws -> Int {
    var result = 0
    while true {
      guard i < data.count else { throw WbxmlError.truncated }
      let byte = data[i]
      i += 1
      result = (result << 7) | Int(byte & 0x7f)
      if byte & 0x80 == 0 { break }
    }
    return result
  }

  // MARK: Encoder

  static func encode(_ root: Node) -> Data {
    var out: [UInt8] = [0x03]  // Version 1.3
    out += encodeMbUInt(0x01)  // publicid „unknown"
    out += encodeMbUInt(0x6a)  // charset UTF-8 (MIBenum 106)
    out.append(0x00)  // String-Tabelle: Länge 0
    var page = 0
    emit(root, &out, &page)
    return Data(out)
  }

  private static func emit(_ node: Node, _ out: inout [UInt8], _ page: inout Int) {
    if node.page != page {
      out.append(0x00)
      out.append(UInt8(node.page))
      page = node.page
    }
    let hasContent = node.text != nil || node.opaque != nil || !node.children.isEmpty
    out.append(hasContent ? node.token | 0x40 : node.token)
    if !hasContent { return }
    if let t = node.text {
      out.append(0x03)
      out += Array(t.utf8)
      out.append(0x00)
    }
    if let o = node.opaque {
      out.append(0xc3)
      out += encodeMbUInt(o.count)
      out += o
    }
    for child in node.children { emit(child, &out, &page) }
    out.append(0x01)
  }

  // MARK: Decoder

  static func decode(_ data: Data) throws -> Node {
    let bytes = [UInt8](data)
    guard !bytes.isEmpty else { throw WbxmlError.empty }
    var i = 0
    i += 1  // version
    _ = try decodeMbUInt(bytes, &i)  // publicid
    _ = try decodeMbUInt(bytes, &i)  // charset
    _ = try decodeMbUInt(bytes, &i)  // string table length

    var page = 0
    var stack: [Node] = []
    var root: Node?

    while i < bytes.count {
      let byte = bytes[i]
      i += 1
      switch byte {
      case 0x00:  // SWITCH_PAGE
        guard i < bytes.count else { throw WbxmlError.truncated }
        page = Int(bytes[i])
        i += 1
      case 0x01:  // END
        if !stack.isEmpty { stack.removeLast() }
      case 0x03:  // STR_I
        guard let top = stack.last else { throw WbxmlError.badStructure }
        top.text = (top.text ?? "") + (try readInlineString(bytes, &i))
      case 0xc3:  // OPAQUE
        guard let top = stack.last else { throw WbxmlError.badStructure }
        let len = try decodeMbUInt(bytes, &i)
        guard i + len <= bytes.count else { throw WbxmlError.truncated }
        top.opaque = Array(bytes[i..<(i + len)])
        i += len
      default:  // Tag-Token
        let hasContent = (byte & 0x40) != 0
        let node = Node(page: page, token: byte & 0x3f)
        if let parent = stack.last {
          parent.children.append(node)
        } else {
          root = node
        }
        if hasContent { stack.append(node) }
      }
    }
    guard let r = root else { throw WbxmlError.badStructure }
    return r
  }

  private static func readInlineString(_ bytes: [UInt8], _ i: inout Int) throws -> String {
    let start = i
    while i < bytes.count, bytes[i] != 0x00 { i += 1 }
    guard i < bytes.count, bytes[i] == 0x00 else { throw WbxmlError.truncated }
    let slice = Array(bytes[start..<i])
    i += 1  // NUL überspringen
    return String(decoding: slice, as: UTF8.self)
  }

  // MARK: Debug-Selbsttest (gegen den kanonischen FolderSync-Byte-Vektor)

  #if DEBUG
    /// Prüft Encoder+Decoder gegen den bekannten FolderSync-Vektor. Optional von Aufrufern in
    /// DEBUG-Builds einmal anstoßbar; nicht in Release kompiliert.
    static func selfTest() {
      let tree = el(Page.folderHierarchy, "FolderSync", [
        txt(Page.folderHierarchy, "SyncKey", "0")
      ])
      let expected: [UInt8] = [
        0x03, 0x01, 0x6a, 0x00, 0x00, 0x07, 0x56, 0x52, 0x03, 0x30, 0x00, 0x01, 0x01,
      ]
      assert([UInt8](encode(tree)) == expected, "WBXML-Encoder weicht vom FolderSync-Vektor ab")
      if let root = try? decode(Data(expected)) {
        assert(root.page == Page.folderHierarchy && root.token == 0x16, "WBXML-Decoder falsch")
        assert(root.children.first?.text == "0", "WBXML-Decoder Textinhalt falsch")
      } else {
        assertionFailure("WBXML-Decoder warf unerwartet")
      }
    }
  #endif
}
