import Foundation

/// Exchange-Transport (EWS) mit Autodiscover, TLS, Certificate Pinning und Auth
/// (Basic + NTLM). Ergebnisse als JSON über die Bridge. NTLM wird vom System über die
/// URLSession-Challenge abgewickelt; Basic wird zusätzlich preemptiv als Header gesetzt.
/// EAS/WBXML und Kerberos folgen iterativ (siehe docs/11-Native-und-App.md).
final class NexusTransport: NSObject, URLSessionDelegate {
  static let shared = NexusTransport()

  /// Laufzeit-Konfiguration (aus Autodiscover/Account-Setup gesetzt).
  var ewsUrl: URL?
  var basicAuthHeader: String?
  private var username: String?
  private var password: String?

  /// Certificate-Pinning-Policy (siehe core-transport/pinning.ts). Leer ⇒ Pinning inaktiv.
  struct PinPolicy {
    let host: String
    let includeSubdomains: Bool
    let pins: [String]
  }
  private var pinPolicies: [PinPolicy] = []

  /// Pro Ordner gemerkte Signatur für DirectPush-Änderungserkennung (Ping/Long-Poll).
  private var folderSignatures: [String: String] = [:]

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.tlsMinimumSupportedProtocolVersion = .TLSv12
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  /// Auth-Challenges: NTLM/Basic/Digest mit gespeicherten Credentials beantworten;
  /// Server-Trust (TLS/Pinning) separat behandeln.
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    switch challenge.protectionSpace.authenticationMethod {
    case NSURLAuthenticationMethodServerTrust:
      guard let trust = challenge.protectionSpace.serverTrust else {
        completionHandler(.cancelAuthenticationChallenge, nil)
        return
      }
      let host = challenge.protectionSpace.host
      // Certificate-Pinning, fail-closed (Entscheidungsregeln: core-transport/pinning.ts):
      // - Kein Policy-Treffer für den Host ⇒ System-Trust (Pinning für diesen Host inaktiv).
      // - Policy vorhanden ⇒ mindestens ein präsentierter SPKI-Pin muss passen, sonst Abbruch.
      if let policy = pinPolicy(for: host) {
        let presented = NexusPinning.spkiPins(for: trust)
        let matches = !presented.isEmpty && presented.contains { policy.pins.contains($0) }
        if matches {
          completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
          completionHandler(.cancelAuthenticationChallenge, nil)
        }
      } else {
        completionHandler(.useCredential, URLCredential(trust: trust))
      }
    case NSURLAuthenticationMethodNTLM,
      NSURLAuthenticationMethodHTTPBasic,
      NSURLAuthenticationMethodHTTPDigest,
      NSURLAuthenticationMethodDefault:
      if challenge.previousFailureCount > 0 {
        completionHandler(.cancelAuthenticationChallenge, nil)
        return
      }
      if let user = username, let pass = password {
        completionHandler(
          .useCredential,
          URLCredential(user: user, password: pass, persistence: .forSession))
      } else {
        completionHandler(.performDefaultHandling, nil)
      }
    default:
      completionHandler(.performDefaultHandling, nil)
    }
  }

  // MARK: Autodiscover

  func discover(email: String, credentialsJson: String) async throws -> String {
    guard let domain = email.split(separator: "@").last.map(String.init)?.lowercased() else {
      throw NexusError.transport("Ungültige E-Mail-Adresse")
    }
    let creds = try JSONSerialization.jsonObject(with: Data(credentialsJson.utf8)) as? [String: Any]

    // Login-Namen ggf. um die NetBIOS-Domäne ergänzen (NTLM erwartet DOMÄNE\Benutzer).
    if let user = creds?["username"] as? String, let secret = creds?["secret"] as? String {
      let netbios = creds?["domain"] as? String
      let effectiveUser =
        (netbios != nil && !user.contains("\\") && !user.contains("@"))
        ? "\(netbios!)\\\(user)" : user
      username = effectiveUser
      password = secret
      basicAuthHeader = Self.basicAuth(user: effectiveUser, password: secret)
    }
    let scheme = (creds?["scheme"] as? String) ?? "basic"

    // 1) Manueller Modus: Autodiscover überspringen, feste EWS-URL verwenden.
    if let manual = creds?["manual"] as? [String: Any],
      let manualEws = manual["ewsUrl"] as? String, let url = URL(string: manualEws) {
      ewsUrl = url
      return try Self.json([
        "emailAddress": email, "auth": scheme, "ewsUrl": manualEws,
        "capabilities": Self.defaultCapabilities,
      ])
    }

    // 2) Autodiscover-POX in MS-konformer Reihenfolge (siehe core-transport/autodiscover.ts):
    //    https-root → autodiscover-subdomain → http-redirect (GET).
    let probes: [(url: String, method: String)] = [
      ("https://\(domain)/autodiscover/autodiscover.xml", "POST"),
      ("https://autodiscover.\(domain)/autodiscover/autodiscover.xml", "POST"),
      ("http://autodiscover.\(domain)/autodiscover/autodiscover.xml", "GET"),
    ]
    for probe in probes {
      guard let url = URL(string: probe.url) else { continue }
      guard let ews = try await fetchAutodiscoverEwsUrl(url, email: email, method: probe.method)
      else { continue }
      ewsUrl = URL(string: ews)
      return try Self.json([
        "emailAddress": email, "auth": scheme, "ewsUrl": ews,
        "capabilities": Self.defaultCapabilities,
      ])
    }

    // 3) EWS-Direkt-Fallbacks, falls Autodiscover nichts liefert (Standardpfade).
    let fallbacks = [
      "https://\(domain)/EWS/Exchange.asmx",
      "https://autodiscover.\(domain)/EWS/Exchange.asmx",
      "https://mail.\(domain)/EWS/Exchange.asmx",
    ]
    for fb in fallbacks {
      guard let url = URL(string: fb) else { continue }
      if try await probeEwsEndpoint(url) {
        ewsUrl = url
        return try Self.json([
          "emailAddress": email, "auth": scheme, "ewsUrl": fb,
          "capabilities": Self.defaultCapabilities,
        ])
      }
    }

    throw NexusError.transport("Autodiscover fehlgeschlagen für \(domain)")
  }

  /// Prüft, ob unter `url` ein EWS-Endpunkt existiert. 200 (WSDL) oder 401/403
  /// (Authentifizierung erforderlich = Server vorhanden) gelten als Treffer.
  private func probeEwsEndpoint(_ url: URL) async throws -> Bool {
    var req = URLRequest(url: url)
    req.httpMethod = "GET"
    req.timeoutInterval = 10
    do {
      let (_, response) = try await session.data(for: req)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      return status == 200 || status == 401 || status == 403
    } catch {
      return false
    }
  }

  /// Holt die EwsUrl aus einer Autodiscover-Antwort. `method`: POX-POST (https) bzw. GET
  /// (http-redirect — URLSession folgt 301/302 automatisch zum https-Endpunkt).
  private func fetchAutodiscoverEwsUrl(
    _ url: URL, email: String, method: String = "POST"
  ) async throws -> String? {
    let pox = """
    <Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
      <Request>
        <EMailAddress>\(EwsSoap.xmlEscape(email))</EMailAddress>
        <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
      </Request>
    </Autodiscover>
    """
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.timeoutInterval = 15
    if method == "POST" {
      req.setValue("text/xml; charset=utf-8", forHTTPHeaderField: "Content-Type")
      req.httpBody = Data(pox.utf8)
    }
    if let auth = basicAuthHeader { req.setValue(auth, forHTTPHeaderField: "Authorization") }
    let (data, response) = try await session.data(for: req)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 || status == 403 {
      throw NexusError.transport("AUTH: Anmeldung abgelehnt (HTTP \(status))")
    }
    guard status == 200 else { return nil }
    // Pragmatisch: <EwsUrl>…</EwsUrl> aus der Antwort lesen (on-device gehärtet).
    let text = String(decoding: data, as: UTF8.self)
    guard let range = text.range(of: "<EwsUrl>"), let end = text.range(of: "</EwsUrl>") else { return nil }
    return String(text[range.upperBound..<end.lowerBound])
  }

  // MARK: Certificate Pinning

  /// Setzt die Pinning-Policy aus JSON (`{ policies: [{ host, pins, includeSubdomains }] }`).
  func configurePinning(_ json: String) {
    guard let obj = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
      let policies = obj["policies"] as? [[String: Any]]
    else {
      pinPolicies = []
      return
    }
    pinPolicies = policies.compactMap { p in
      guard let host = p["host"] as? String, let pins = p["pins"] as? [String], !pins.isEmpty
      else { return nil }
      return PinPolicy(
        host: host.lowercased(), includeSubdomains: (p["includeSubdomains"] as? Bool) ?? false,
        pins: pins)
    }
  }

  /// Findet die spezifischste passende Policy für `host` (exakt vor Subdomain-Wildcard).
  private func pinPolicy(for host: String) -> PinPolicy? {
    let h = host.lowercased()
    if let exact = pinPolicies.first(where: { $0.host == h }) { return exact }
    return pinPolicies.first { $0.includeSubdomains && h.hasSuffix(".\($0.host)") }
  }

  // MARK: DirectPush (Ping / Long-Poll)

  /// Bounded Long-Poll: kehrt zurück, sobald sich in einem der Ordner etwas ändert, sonst nach
  /// `timeoutSec`. Änderungserkennung über eine FindItem-Signatur (Anzahl + neuste Item-ID).
  /// Der erste Aufruf setzt die Basislinie. (Vollwertiges EAS-Ping/WBXML folgt iterativ.)
  func ping(accountId: String, folderIdsJson: String, timeoutSec: Double) async throws -> String {
    let folders =
      (try? JSONSerialization.jsonObject(with: Data(folderIdsJson.utf8)) as? [String]) ?? []
    let deadline = Date().addingTimeInterval(timeoutSec)
    let pollInterval: UInt64 = 15_000_000_000  // 15 s

    while Date() < deadline {
      var changed: [String] = []
      for folderId in folders {
        let signature = try await folderSignature(folderId)
        if let previous = folderSignatures[folderId], previous != signature {
          changed.append(folderId)
        }
        folderSignatures[folderId] = signature
      }
      if !changed.isEmpty {
        return try Self.json(["status": "changed", "changedFolderIds": changed])
      }
      try? await Task.sleep(nanoseconds: pollInterval)
    }
    return try Self.json(["status": "timeout", "changedFolderIds": [String]()])
  }

  /// Signatur des Ordnerinhalts (Anzahl + neuste Item-ID) für die Änderungserkennung.
  private func folderSignature(_ folderId: String) async throws -> String {
    let xml = try await post(EwsSoap.findItem(folderId: mapFolder(folderId), query: ""))
    let ids = EwsSoap.extractItemIds(xml)
    return "\(ids.count):\(ids.first ?? "")"
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
    if code == 401 || code == 403 {
      throw NexusError.transport("AUTH: Anmeldung abgelehnt (HTTP \(code))")
    }
    guard code == 200 else { throw NexusError.transport("SERVER: EWS HTTP \(code)") }
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
