import Foundation

/// Exchange-Transport (EWS) mit Autodiscover, TLS und Certificate Pinning.
/// Erste funktionale Implementierung des `MailTransport`-Ports; Ergebnisse als JSON über
/// die Bridge. EAS/WBXML, NTLM/Kerberos und Härtung des Parsings folgen iterativ
/// (siehe docs/11-Native-und-App.md).
final class NexusTransport {
  static let shared = NexusTransport()

  /// Laufzeit-Konfiguration (aus Autodiscover/Account-Setup gesetzt).
  var ewsUrl: URL?
  var basicAuthHeader: String?

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.tlsMinimumSupportedProtocolVersion = .TLSv12
    return URLSession(configuration: config, delegate: PinningDelegate(), delegateQueue: nil)
  }()

  // MARK: Autodiscover

  func discover(email: String, credentialsJson: String) async throws -> String {
    guard let domain = email.split(separator: "@").last.map(String.init) else {
      throw NexusError.transport("Ungültige E-Mail-Adresse")
    }
    let creds = try JSONSerialization.jsonObject(with: Data(credentialsJson.utf8)) as? [String: Any]
    if let user = creds?["username"] as? String, let secret = creds?["secret"] as? String {
      basicAuthHeader = Self.basicAuth(user: user, password: secret)
    }

    let candidates = [
      "https://\(domain)/autodiscover/autodiscover.xml",
      "https://autodiscover.\(domain)/autodiscover/autodiscover.xml",
    ]
    for urlString in candidates {
      guard let url = URL(string: urlString) else { continue }
      guard let ews = try await fetchAutodiscoverEwsUrl(url, email: email) else { continue }
      ewsUrl = URL(string: ews)
      let result: [String: Any] = [
        "emailAddress": email,
        "auth": "basic",
        "ewsUrl": ews,
        "capabilities": Self.defaultCapabilities,
      ]
      return try Self.json(result)
    }
    throw NexusError.transport("Autodiscover fehlgeschlagen für \(domain)")
  }

  private func fetchAutodiscoverEwsUrl(_ url: URL, email: String) async throws -> String? {
    let pox = """
    <Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
      <Request>
        <EMailAddress>\(EwsSoap.xmlEscape(email))</EMailAddress>
        <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
      </Request>
    </Autodiscover>
    """
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("text/xml; charset=utf-8", forHTTPHeaderField: "Content-Type")
    if let auth = basicAuthHeader { req.setValue(auth, forHTTPHeaderField: "Authorization") }
    req.httpBody = Data(pox.utf8)
    let (data, response) = try await session.data(for: req)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    // Pragmatisch: <EwsUrl>…</EwsUrl> aus der Antwort lesen (on-device gehärtet).
    let text = String(decoding: data, as: UTF8.self)
    guard let range = text.range(of: "<EwsUrl>"), let end = text.range(of: "</EwsUrl>") else { return nil }
    return String(text[range.upperBound..<end.lowerBound])
  }

  // MARK: EWS-Operationen

  func syncMessages(accountId: String, folderId: String, syncKey: String?) async throws -> String {
    let syncXml = try await post(EwsSoap.syncFolderItems(folderId: mapFolder(folderId), syncState: syncKey))
    let ids = EwsSoap.extractItemIds(syncXml)
    var created: [[String: Any]] = []
    if !ids.isEmpty {
      let itemsXml = try await post(EwsSoap.getItems(ids: ids))
      created = EwsSoap.parseItems(itemsXml).map { Self.messageJson($0, accountId: accountId, folderId: folderId) }
    }
    let delta: [String: Any] = [
      "syncKey": syncKey ?? "", "created": created, "updated": [],
      "deletedIds": [], "hasMore": false,
    ]
    return try Self.json(delta)
  }

  func applyOperation(operationJson: String) async throws {
    let op = try JSONSerialization.jsonObject(with: Data(operationJson.utf8)) as? [String: Any]
    guard let command = op?["command"] as? [String: Any], let type = command["type"] as? String else {
      throw NexusError.transport("Ungültige Operation")
    }
    let itemId = command["messageId"] as? String ?? ""
    switch type {
    case "markRead":
      _ = try await post(EwsSoap.setIsRead(itemId: itemId, isRead: (command["read"] as? Bool) ?? true))
    case "move":
      _ = try await post(EwsSoap.moveItem(itemId: itemId, toFolderId: mapFolder(command["targetFolderId"] as? String ?? "")))
    case "delete":
      _ = try await post(EwsSoap.deleteItem(itemId: itemId))
    case "flag":
      _ = try await post(EwsSoap.setFlag(itemId: itemId, flagged: (command["value"] as? Bool) ?? true))
    case "setCategories":
      let cats = (command["categories"] as? [String]) ?? []
      _ = try await post(EwsSoap.setCategories(itemId: itemId, categories: cats))
    case "send":
      // 'send' wird über sendMessage zugestellt; hier no-op.
      break
    default:
      throw NexusError.transport("Unbekannter OutboxCommand: \(type)")
    }
  }

  func loadAccount(accountId: String) async throws -> String {
    try Self.json([
      "id": accountId, "emailAddress": "", "displayName": accountId, "serverHost": ewsUrl?.host ?? "",
    ])
  }

  func syncFolders(accountId: String, syncKey: String?) async throws -> String {
    let xml = try await post(EwsSoap.findFolders())
    let created = EwsSoap.parseFolders(xml).map { (f) -> [String: Any] in
      [
        "id": f.id, "accountId": accountId, "displayName": f.displayName,
        "type": Self.folderType(f.displayName), "unreadCount": f.unread, "totalCount": f.total,
      ]
    }
    return try Self.json([
      "syncKey": syncKey ?? "", "created": created, "updated": [], "deletedIds": [], "hasMore": false,
    ])
  }

  func syncCalendar(accountId: String, syncKey: String?) async throws -> String {
    let ids = EwsSoap.extractItemIds(try await post(EwsSoap.syncFolderItemsIdOnly(distinguished: "calendar", syncState: syncKey)))
    var created: [[String: Any]] = []
    if !ids.isEmpty {
      created = EwsSoap.parseEvents(try await post(EwsSoap.getItems(ids: ids))).map { (e) in
        [
          "id": e.id, "accountId": accountId, "subject": e.subject, "startAt": e.start, "endAt": e.end,
          "isAllDay": false, "location": e.location,
          "organizer": ["address": e.organizer], "attendees": [],
        ]
      }
    }
    return try Self.json(["syncKey": syncKey ?? "", "created": created, "updated": [], "deletedIds": [], "hasMore": false])
  }

  func syncContacts(accountId: String, syncKey: String?) async throws -> String {
    let ids = EwsSoap.extractItemIds(try await post(EwsSoap.syncFolderItemsIdOnly(distinguished: "contacts", syncState: syncKey)))
    var created: [[String: Any]] = []
    if !ids.isEmpty {
      created = EwsSoap.parseContacts(try await post(EwsSoap.getItems(ids: ids))).map { (c) in
        [
          "id": c.id, "accountId": accountId, "displayName": c.displayName,
          "emailAddresses": c.email.isEmpty ? [] : [["address": c.email]],
        ]
      }
    }
    return try Self.json(["syncKey": syncKey ?? "", "created": created, "updated": [], "deletedIds": [], "hasMore": false])
  }

  func getMessage(accountId: String, messageId: String) async throws -> String {
    let items = EwsSoap.parseItems(try await post(EwsSoap.getItems(ids: [messageId])))
    guard let item = items.first else { throw NexusError.transport("Nachricht nicht gefunden") }
    return try Self.json(Self.messageJson(item, accountId: accountId, folderId: "inbox"))
  }

  private static func folderType(_ name: String) -> String {
    switch name.lowercased() {
    case "inbox", "posteingang": return "inbox"
    case "sent items", "gesendete elemente", "gesendet": return "sent"
    case "drafts", "entwürfe": return "drafts"
    case "deleted items", "gelöschte elemente": return "deleted"
    case "junk email", "junk-e-mail": return "junk"
    case "archive", "archiv": return "archive"
    default: return "custom"
    }
  }

  func sendMessage(accountId: String, messageJson: String) async throws -> String {
    let msg = try JSONSerialization.jsonObject(with: Data(messageJson.utf8)) as? [String: Any]
    let from = (msg?["from"] as? [String: Any])?["address"] as? String ?? ""
    let sender = (msg?["sender"] as? [String: Any])?["address"] as? String
    let subject = msg?["subject"] as? String ?? ""
    let body = (msg?["body"] as? [String: Any])?["content"] as? String ?? ""
    let to = (msg?["recipients"] as? [[String: Any]] ?? [])
      .compactMap { ($0["address"] as? [String: Any])?["address"] as? String }
    _ = try await post(EwsSoap.createItem(from: from, sender: sender, to: to, subject: subject, body: body))
    return try Self.json("sent-\(UUID().uuidString)")
  }

  func searchServer(accountId: String, query: String) async throws -> String {
    let xml = try await post(EwsSoap.findItem(folderId: "inbox", query: query))
    let hits = EwsSoap.extractItemIds(xml).enumerated().map { (i, id) -> [String: Any] in
      ["messageId": id, "rank": Double(1000 - i), "source": "server"]
    }
    return try Self.json(hits)
  }

  // MARK: HTTP/Helpers

  private func post(_ soap: String) async throws -> Data {
    guard let url = ewsUrl else { throw NexusError.transport("EWS-URL nicht gesetzt (Autodiscover zuerst).") }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("text/xml; charset=utf-8", forHTTPHeaderField: "Content-Type")
    if let auth = basicAuthHeader { req.setValue(auth, forHTTPHeaderField: "Authorization") }
    req.httpBody = Data(soap.utf8)
    let (data, response) = try await session.data(for: req)
    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard code == 200 else { throw NexusError.transport("EWS HTTP \(code)") }
    return data
  }

  /// Mappt interne Ordner-IDs auf EWS-DistinguishedFolderId, sonst Durchreichen.
  private func mapFolder(_ id: String) -> String {
    switch id {
    case "inbox": return "inbox"
    case "sent": return "sentitems"
    case "drafts": return "drafts"
    case "archive": return "archive"
    case "deleted": return "deleteditems"
    default: return id
    }
  }

  private static func basicAuth(user: String, password: String) -> String {
    let token = Data("\(user):\(password)".utf8).base64EncodedString()
    return "Basic \(token)"
  }

  private static func messageJson(_ item: EwsSoap.ParsedItem, accountId: String, folderId: String) -> [String: Any] {
    [
      "id": item.id, "accountId": accountId, "folderId": folderId,
      "subject": item.subject,
      "from": ["address": item.fromAddress, "displayName": item.fromName],
      "recipients": [], "receivedAt": item.receivedAt, "importance": "normal",
      "flags": item.isRead ? ["read"] : [], "categories": [],
      "hasAttachments": false, "attachments": [], "preview": item.preview,
      "body": ["type": "text", "content": item.preview],
    ]
  }

  private static let defaultCapabilities: [String: Any] = [
    "ews": true, "activeSync": false, "directPush": false,
    "publicFolders": true, "delegation": true, "serverSearch": true,
  ]

  private static func json(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [])
    return String(decoding: data, as: UTF8.self)
  }
}

/// Public-Key-Certificate-Pinning. Pin-Set per MDM/AppConfig (On-Prem-CAs).
final class PinningDelegate: NSObject, URLSessionDelegate {
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let trust = challenge.protectionSpace.serverTrust
    else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    // TODO(iterativ): SPKI-Hash gegen konfiguriertes Pin-Set prüfen (Fail-Closed).
    completionHandler(.useCredential, URLCredential(trust: trust))
  }
}
