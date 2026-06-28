import Foundation

/// Lesehilfen für dekodierte EAS-WBXML-Bäume (`Wbxml.Node`). Token werden über die
/// `Wbxml.tags`-Tabellen aufgelöst, sodass nach Tag-NAMEN gesucht werden kann.
enum EasParse {
  static func token(_ page: Int, _ tag: String) -> UInt8? { Wbxml.tags[page]?[tag] }

  /// Erstes Vorkommen (Pre-Order-DFS) eines Tags im gesamten Baum.
  static func first(_ root: Wbxml.Node, page: Int, tag: String) -> Wbxml.Node? {
    guard let tok = token(page, tag) else { return nil }
    return firstByToken(root, page: page, token: tok)
  }

  private static func firstByToken(_ node: Wbxml.Node, page: Int, token: UInt8) -> Wbxml.Node? {
    if node.page == page, node.token == token { return node }
    for child in node.children {
      if let found = firstByToken(child, page: page, token: token) { return found }
    }
    return nil
  }

  /// Alle Vorkommen eines Tags (Pre-Order-DFS).
  static func all(_ root: Wbxml.Node, page: Int, tag: String) -> [Wbxml.Node] {
    guard let tok = token(page, tag) else { return [] }
    var out: [Wbxml.Node] = []
    collect(root, page: page, token: tok, into: &out)
    return out
  }

  private static func collect(
    _ node: Wbxml.Node, page: Int, token: UInt8, into out: inout [Wbxml.Node]
  ) {
    if node.page == page, node.token == token { out.append(node) }
    for child in node.children { collect(child, page: page, token: token, into: &out) }
  }

  /// Text des ersten Vorkommens eines Tags.
  static func text(_ root: Wbxml.Node, page: Int, tag: String) -> String? {
    first(root, page: page, tag: tag)?.text
  }

  /// Direktes Kind mit Tag (nicht rekursiv) — für eindeutige Felder unter einem bekannten Knoten.
  static func child(_ node: Wbxml.Node, page: Int, tag: String) -> Wbxml.Node? {
    guard let tok = token(page, tag) else { return nil }
    return node.children.first { $0.page == page && $0.token == tok }
  }

  /// Text eines direkten Kindes.
  static func childText(_ node: Wbxml.Node, page: Int, tag: String) -> String? {
    child(node, page: page, tag: tag)?.text
  }

  // MARK: Nachrichten-Mapping (Email Page 2 + AirSyncBase Page 17 → MailMessageJson)

  /// Baut aus dem Feld-Container (`ApplicationData` beim Sync bzw. `Properties` bei
  /// ItemOperations) das `MailMessageJson`-Dict, das `SqlMailStore` erwartet.
  static func message(scope: Wbxml.Node, serverId: String, accountId: String, folderId: String)
    -> [String: Any]
  {
    let e = Wbxml.Page.email
    let b = Wbxml.Page.airSyncBase

    let subject = text(scope, page: e, tag: "Subject") ?? ""
    let fromRaw = text(scope, page: e, tag: "From") ?? ""
    let toRaw = text(scope, page: e, tag: "To") ?? ""
    let ccRaw = text(scope, page: e, tag: "Cc") ?? ""
    let dateRaw = text(scope, page: e, tag: "DateReceived") ?? ""
    let read = (text(scope, page: e, tag: "Read") ?? "0") == "1"
    let importance = text(scope, page: e, tag: "Importance") ?? "1"

    var bodyType = "text"
    var bodyContent = ""
    if let bodyNode = first(scope, page: b, tag: "Body") {
      let t = childText(bodyNode, page: b, tag: "Type") ?? "1"
      bodyType = (t == "2") ? "html" : "text"
      bodyContent = childText(bodyNode, page: b, tag: "Data") ?? ""
    }

    var attachments: [[String: Any]] = []
    for att in all(scope, page: b, tag: "Attachment") {
      let name = childText(att, page: b, tag: "DisplayName") ?? ""
      let fileRef = childText(att, page: b, tag: "FileReference") ?? ""
      let size = Int(childText(att, page: b, tag: "EstimatedDataSize") ?? "0") ?? 0
      let isInline = (childText(att, page: b, tag: "IsInline") ?? "0") == "1"
      let ctype = childText(att, page: b, tag: "ContentType") ?? "application/octet-stream"
      attachments.append([
        "id": fileRef, "name": name, "contentType": ctype, "sizeBytes": size, "isInline": isInline,
      ])
    }

    let preview = textPreview(bodyContent, isHtml: bodyType == "html")
    let recipients = parseRecipients(toRaw, kind: "to") + parseRecipients(ccRaw, kind: "cc")
    let flags: [String] = read ? ["read"] : []
    return [
      "id": serverId, "accountId": accountId, "folderId": folderId,
      "subject": subject,
      "from": parseAddress(fromRaw),
      "recipients": recipients,
      "receivedAt": parseDate(dateRaw),
      "importance": mapImportance(importance),
      "flags": flags, "categories": [],
      "hasAttachments": !attachments.isEmpty,
      "attachments": attachments,
      "preview": preview,
      "body": ["type": bodyType, "content": bodyContent.isEmpty ? preview : bodyContent],
    ]
  }

  static func mapImportance(_ v: String) -> String {
    switch v {
    case "0": return "low"
    case "2": return "high"
    default: return "normal"
    }
  }

  /// EAS `DateReceived` (ISO-8601 UTC) → ms seit Epoch; nie NaN/negativ-undefiniert (0 bei Fehler).
  static func parseDate(_ s: String) -> Double {
    if s.isEmpty { return 0 }
    let withFrac = ISO8601DateFormatter()
    withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFrac.date(from: s) { return d.timeIntervalSince1970 * 1000 }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    if let d = plain.date(from: s) { return d.timeIntervalSince1970 * 1000 }
    return 0
  }

  /// „Name <addr>" oder „addr" → `{address, displayName?}`.
  static func parseAddress(_ raw: String) -> [String: Any] {
    let (name, addr) = splitNameAddr(raw)
    if name.isEmpty { return ["address": addr] }
    return ["address": addr, "displayName": name]
  }

  /// Komma-getrennte RFC822-Liste → `[{kind, address:{address, displayName?}}]`.
  static func parseRecipients(_ raw: String, kind: String) -> [[String: Any]] {
    if raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return [] }
    return splitList(raw).compactMap { part -> [String: Any]? in
      let (name, addr) = splitNameAddr(part)
      if addr.isEmpty { return nil }
      let address: [String: Any] =
        name.isEmpty ? ["address": addr] : ["address": addr, "displayName": name]
      return ["kind": kind, "address": address]
    }
  }

  private static func splitNameAddr(_ raw: String) -> (String, String) {
    let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if let lt = t.lastIndex(of: "<"), let gt = t.lastIndex(of: ">"), lt < gt {
      let addr = String(t[t.index(after: lt)..<gt]).trimmingCharacters(in: .whitespaces)
      var name = String(t[t.startIndex..<lt]).trimmingCharacters(in: .whitespaces)
      name = name.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
      return (name, addr)
    }
    return ("", t)
  }

  /// Splittet eine Empfängerliste an Kommas, die NICHT in Anführungszeichen oder `<…>` stehen.
  private static func splitList(_ raw: String) -> [String] {
    var parts: [String] = []
    var cur = ""
    var inQuote = false
    var inAngle = false
    for ch in raw {
      if ch == "\"" {
        inQuote.toggle()
        cur.append(ch)
      } else if ch == "<" {
        inAngle = true
        cur.append(ch)
      } else if ch == ">" {
        inAngle = false
        cur.append(ch)
      } else if ch == ",", !inQuote, !inAngle {
        parts.append(cur)
        cur = ""
      } else {
        cur.append(ch)
      }
    }
    if !cur.trimmingCharacters(in: .whitespaces).isEmpty { parts.append(cur) }
    return parts
  }

  /// Kurzvorschau (HTML wird grob entschlagwortet), max. 140 Zeichen.
  static func textPreview(_ content: String, isHtml: Bool) -> String {
    let text: String
    if isHtml {
      text =
        content
        .replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        .replacingOccurrences(of: "&nbsp;", with: " ")
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
    } else {
      text = content.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return String(text.prefix(140))
  }
}
