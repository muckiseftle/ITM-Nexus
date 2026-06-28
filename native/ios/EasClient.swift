import Foundation

/// Exchange ActiveSync (EAS / WBXML) — paralleler Transport zum EWS-Pfad in `NexusTransport`.
///
/// Nutzt `NexusTransport` für HTTP (dieselbe gepinnte `URLSession`, Auth-Challenge,
/// Redirect-Schutz) — keine Duplikate der Sicherheits-/Netzwerkschicht.
///
/// P1 (diese Datei): Versions-Negotiation (OPTIONS), zweiphasiges `Provision` und ein
/// `verify` (Ende-zu-Ende inkl. FolderSync „0"). FolderSync→Ordner, Sync→Mails, Ping usw.
/// folgen in P2+. Noch „dark": über `NexusTransport.easVerify` (Diagnose-Bridge) anstoßbar,
/// nicht im Live-Login-Pfad.
final class EasClient {
  static let shared = EasClient()

  enum EasError: Error {
    case auth(String)  // 401/403 → Anmeldung abgelehnt
    case hard(String)  // EAS nicht nutzbar → EWS-Fallback
    case soft(String)  // z. B. SyncKey ungültig → in-place behandelt (P3)

    var isHard: Bool {
      if case .hard = self { return true } else { return false }
    }
  }

  struct AccountState {
    var easUrl: URL
    var protocolVersion: String
    var policyKey: String
    var deviceId: String
    var deviceType: String
    var user: String
  }

  private let lock = NSLock()
  private var states: [String: AccountState] = [:]

  private func getState(_ id: String) -> AccountState? {
    lock.lock()
    defer { lock.unlock() }
    return states[id]
  }
  private func putState(_ id: String, _ state: AccountState) {
    lock.lock()
    defer { lock.unlock() }
    states[id] = state
  }
  private func setPolicyKey(_ id: String, _ key: String) {
    lock.lock()
    defer { lock.unlock() }
    states[id]?.policyKey = key
  }

  // MARK: Geräte-ID (stabil, Keychain)

  /// EAS bindet PolicyKey/Sync-State an die DeviceId — sie muss über App-Starts STABIL bleiben.
  static func deviceId(for accountId: String) throws -> String {
    let key = "nexus:eas:deviceid:\(accountId)"
    if let existing = try NexusSecureStore.get(key), !existing.isEmpty { return existing }
    let id = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()  // 32 hex
    try NexusSecureStore.set(key, value: id)
    return id
  }

  // MARK: OPTIONS-Versions-Negotiation

  private static let supportedVersions = ["14.1", "14.0", "12.1", "12.0"]

  static func highestSupportedVersion(_ header: String) -> String? {
    let offered = Set(header.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
    return supportedVersions.first { offered.contains($0) }
  }

  func negotiate(_ url: URL) async throws -> String {
    let http = try await NexusTransport.shared.easOptions(url)
    if http.statusCode == 401 || http.statusCode == 403 {
      throw EasError.auth("EAS-Anmeldung abgelehnt (HTTP \(http.statusCode))")
    }
    guard http.statusCode == 200 else { throw EasError.hard("EAS OPTIONS HTTP \(http.statusCode)") }
    let header = http.value(forHTTPHeaderField: "MS-ASProtocolVersions") ?? ""
    guard let version = Self.highestSupportedVersion(header) else {
      throw EasError.hard("Keine unterstützte EAS-Version (Server bot: \(header))")
    }
    return version
  }

  // MARK: Provision (zweiphasig, Code-Page 14)

  private func provisionBody(policyKey: String?) -> Data {
    let p = Wbxml.Page.provision
    var policyChildren: [Wbxml.Node] = [Wbxml.txt(p, "PolicyType", "MS-EAS-Provisioning-WBXML")]
    if let pk = policyKey {
      policyChildren.append(Wbxml.txt(p, "PolicyKey", pk))
      policyChildren.append(Wbxml.txt(p, "Status", "1"))  // Policy akzeptiert
    }
    let tree = Wbxml.el(
      p, "Provision",
      [Wbxml.el(p, "Policies", [Wbxml.el(p, "Policy", policyChildren)])])
    return Wbxml.encode(tree)
  }

  /// Request- + Acknowledge-Phase; liefert den finalen PolicyKey.
  func provision(_ accountId: String) async throws -> String {
    let tempKey = try await sendProvision(accountId, body: provisionBody(policyKey: nil))
    return try await sendProvision(accountId, body: provisionBody(policyKey: tempKey))
  }

  private func sendProvision(_ accountId: String, body: Data) async throws -> String {
    guard let st = getState(accountId) else { throw EasError.hard("EAS-Status fehlt") }
    let (data, http) = try await NexusTransport.shared.easPost(
      st.easUrl, command: "Provision", deviceId: st.deviceId, deviceType: st.deviceType,
      user: st.user, protocolVersion: st.protocolVersion, policyKey: st.policyKey, body: body)
    if http.statusCode == 401 || http.statusCode == 403 {
      throw EasError.auth("EAS-Anmeldung abgelehnt (HTTP \(http.statusCode))")
    }
    guard http.statusCode == 200 else { throw EasError.hard("Provision HTTP \(http.statusCode)") }
    guard let root = try? Wbxml.decode(data) else { throw EasError.hard("Provision: WBXML defekt") }
    let p = Wbxml.Page.provision
    let status = EasParse.text(root, page: p, tag: "Status") ?? "?"
    guard status == "1" else { throw EasError.hard("Provision Status \(status)") }
    guard let key = EasParse.text(root, page: p, tag: "PolicyKey"), !key.isEmpty else {
      throw EasError.hard("Provision ohne PolicyKey")
    }
    return key
  }

  // MARK: verify (OPTIONS → Provision → FolderSync „0")

  func verify(accountId: String, easUrl: URL, user: String) async throws -> String {
    let deviceId = try Self.deviceId(for: accountId)
    let version = try await negotiate(easUrl)
    putState(
      accountId,
      AccountState(
        easUrl: easUrl, protocolVersion: version, policyKey: "0", deviceId: deviceId,
        deviceType: "iPhone", user: user))
    let finalKey = try await provision(accountId)
    setPolicyKey(accountId, finalKey)
    let folders = try await fetchFolders(accountId, syncKey: "0")  // Ende-zu-Ende
    let json = NexusJSON.string(from: [
      "verified": true, "protocolVersion": version, "folderCount": folders.created.count,
    ])
    return json ?? "{\"verified\":true}"
  }

  // MARK: FolderSync (Code-Page 7) → SyncDelta<MailFolder>

  /// Vollständiger Ordnerabgleich. Liefert das `SyncDelta<MailFolder>`-JSON wie der EWS-Pfad.
  func syncFolders(accountId: String, syncKey: String?) async throws -> String {
    let r = try await fetchFolders(accountId, syncKey: syncKey ?? "0")
    let json = NexusJSON.string(from: [
      "syncKey": r.newKey, "created": r.created, "updated": [], "deletedIds": r.deleted,
      "hasMore": false,
    ])
    return json ?? "{}"
  }

  private func fetchFolders(_ accountId: String, syncKey: String, retried: Bool = false)
    async throws -> (newKey: String, created: [[String: Any]], deleted: [String])
  {
    guard let st = getState(accountId) else { throw EasError.hard("EAS-Status fehlt") }
    let f = Wbxml.Page.folderHierarchy
    let body = Wbxml.encode(Wbxml.el(f, "FolderSync", [Wbxml.txt(f, "SyncKey", syncKey)]))
    let (data, http) = try await NexusTransport.shared.easPost(
      st.easUrl, command: "FolderSync", deviceId: st.deviceId, deviceType: st.deviceType,
      user: st.user, protocolVersion: st.protocolVersion, policyKey: st.policyKey, body: body)
    // 449 = Provisioning erforderlich → einmal provisionieren und neu versuchen.
    if http.statusCode == 449, !retried {
      _ = try await provision(accountId)
      return try await fetchFolders(accountId, syncKey: syncKey, retried: true)
    }
    guard http.statusCode == 200 else { throw EasError.hard("FolderSync HTTP \(http.statusCode)") }
    guard let root = try? Wbxml.decode(data) else { throw EasError.hard("FolderSync: WBXML defekt") }
    let status = EasParse.text(root, page: f, tag: "Status") ?? "?"
    // Status 9 = ungültiger FolderSyncKey → auf „0" zurücksetzen und einmal neu.
    if status == "9", syncKey != "0", !retried {
      return try await fetchFolders(accountId, syncKey: "0", retried: true)
    }
    guard status == "1" else { throw EasError.hard("FolderSync Status \(status)") }
    let newKey = EasParse.text(root, page: f, tag: "SyncKey") ?? syncKey

    var created: [[String: Any]] = []
    var deleted: [String] = []
    for node in EasParse.all(root, page: f, tag: "Add") + EasParse.all(root, page: f, tag: "Update") {
      guard let serverId = EasParse.childText(node, page: f, tag: "ServerId") else { continue }
      let name = EasParse.childText(node, page: f, tag: "DisplayName") ?? ""
      let type = EasParse.childText(node, page: f, tag: "Type") ?? ""
      created.append([
        "id": serverId, "accountId": accountId, "displayName": name,
        "type": Self.mapFolderType(type: type, name: name), "unreadCount": 0, "totalCount": 0,
      ])
    }
    for node in EasParse.all(root, page: f, tag: "Delete") {
      if let serverId = EasParse.childText(node, page: f, tag: "ServerId") { deleted.append(serverId) }
    }
    return (newKey, created, deleted)
  }

  /// EAS-Ordnertyp (numerisch) → NEXUS-Typ; sonst Namens-Heuristik (mehrsprachig).
  private static func mapFolderType(type: String, name: String) -> String {
    switch type {
    case "2": return "inbox"
    case "3": return "drafts"
    case "4": return "deleted"
    case "5": return "sent"
    default: break
    }
    let n = name.lowercased()
    if n.contains("junk") { return "junk" }
    if n.contains("archiv") { return "archive" }
    if n.contains("sent") || n.contains("gesendet") { return "sent" }
    if n.contains("draft") || n.contains("entwür") { return "drafts" }
    if n.contains("inbox") || n.contains("posteingang") { return "inbox" }
    if n.contains("delete") || n.contains("gelösch") || n.contains("trash") { return "deleted" }
    return "custom"
  }

  // MARK: ServerId → CollectionId (für ItemOperations:Fetch beim Öffnen)

  private var collectionForServerId: [String: String] = [:]

  private func cacheCollection(_ serverId: String, _ collectionId: String) {
    lock.lock()
    defer { lock.unlock() }
    collectionForServerId[serverId] = collectionId
  }
  private func collection(forServerId serverId: String) -> String? {
    lock.lock()
    defer { lock.unlock() }
    return collectionForServerId[serverId]
  }

  // MARK: Generischer EAS-Request (mit 449-Provisioning-Retry)

  /// POSTet einen WBXML-Body und liefert die rohen Antwort-Bytes (kann bei „keine Änderungen"
  /// LEER sein — das ist gültig und wird vom Aufrufer behandelt).
  private func easSend(_ accountId: String, command: String, body: Data, retried: Bool = false)
    async throws -> Data
  {
    guard let st = getState(accountId) else { throw EasError.hard("EAS-Status fehlt") }
    let (data, http) = try await NexusTransport.shared.easPost(
      st.easUrl, command: command, deviceId: st.deviceId, deviceType: st.deviceType,
      user: st.user, protocolVersion: st.protocolVersion, policyKey: st.policyKey, body: body)
    if http.statusCode == 449, !retried {
      _ = try await provision(accountId)
      return try await easSend(accountId, command: command, body: body, retried: true)
    }
    if http.statusCode == 401 || http.statusCode == 403 {
      throw EasError.auth("EAS-Anmeldung abgelehnt (HTTP \(http.statusCode))")
    }
    guard http.statusCode == 200 else { throw EasError.hard("\(command) HTTP \(http.statusCode)") }
    return data
  }

  // MARK: Sync (Code-Pages 0/2/17) → syncMessages

  func syncMessages(accountId: String, folderId: String, syncKey: String?) async throws -> String {
    let startKey: String
    if let sk = syncKey, !sk.isEmpty, sk != "0" {
      startKey = sk
    } else {
      startKey = try await primeCollection(accountId, collectionId: folderId)
    }
    let r = try await syncCollection(accountId, collectionId: folderId, syncKey: startKey)
    let json = NexusJSON.string(from: [
      "syncKey": r.newKey, "created": r.created, "updated": [], "deletedIds": r.deleted,
      "hasMore": r.hasMore,
    ])
    return json ?? "{}"
  }

  /// Erst-Sync Schritt 1: SyncKey „0" → neuer SyncKey (ohne Items).
  private func primeCollection(_ accountId: String, collectionId: String) async throws -> String {
    let a = Wbxml.Page.airSync
    let req = Wbxml.el(
      a, "Sync",
      [
        Wbxml.el(
          a, "Collections",
          [
            Wbxml.el(
              a, "Collection",
              [Wbxml.txt(a, "SyncKey", "0"), Wbxml.txt(a, "CollectionId", collectionId)])
          ])
      ])
    let data = try await easSend(accountId, command: "Sync", body: Wbxml.encode(req))
    guard let root = try? Wbxml.decode(data), let coll = EasParse.first(root, page: a, tag: "Collection")
    else { throw EasError.hard("Sync(init): WBXML/Collection fehlt") }
    let status = EasParse.text(coll, page: a, tag: "Status") ?? "?"
    guard status == "1" else { throw EasError.hard("Sync(init) Status \(status)") }
    return EasParse.text(coll, page: a, tag: "SyncKey") ?? "0"
  }

  private func syncCollection(
    _ accountId: String, collectionId: String, syncKey: String, retried: Bool = false
  ) async throws -> (newKey: String, created: [[String: Any]], deleted: [String], hasMore: Bool) {
    let a = Wbxml.Page.airSync
    let b = Wbxml.Page.airSyncBase
    // BodyPreference: gekürztes HTML (32 KB) — Speicher-schonend; voller Body beim Öffnen (Fetch).
    let options = Wbxml.el(
      a, "Options",
      [
        Wbxml.el(
          b, "BodyPreference",
          [Wbxml.txt(b, "Type", "2"), Wbxml.txt(b, "TruncationSize", "32768")])
      ])
    let collection = Wbxml.el(
      a, "Collection",
      [
        Wbxml.txt(a, "SyncKey", syncKey),
        Wbxml.txt(a, "CollectionId", collectionId),
        Wbxml.txt(a, "DeletesAsMoves", "1"),
        Wbxml.txt(a, "GetChanges", "1"),
        Wbxml.txt(a, "WindowSize", "50"),
        options,
      ])
    let req = Wbxml.el(a, "Sync", [Wbxml.el(a, "Collections", [collection])])
    let data = try await easSend(accountId, command: "Sync", body: Wbxml.encode(req))
    // Leere Antwort = keine Änderungen → SyncKey behalten.
    if data.isEmpty { return (syncKey, [], [], false) }
    guard let root = try? Wbxml.decode(data), let coll = EasParse.first(root, page: a, tag: "Collection")
    else { throw EasError.hard("Sync: WBXML/Collection fehlt") }
    let status = EasParse.text(coll, page: a, tag: "Status") ?? "?"
    // Status 3 = ungültiger SyncKey → neu primen und einmal wiederholen.
    if status == "3", !retried {
      let fresh = try await primeCollection(accountId, collectionId: collectionId)
      return try await syncCollection(
        accountId, collectionId: collectionId, syncKey: fresh, retried: true)
    }
    guard status == "1" else { throw EasError.hard("Sync Status \(status)") }
    let newKey = EasParse.text(coll, page: a, tag: "SyncKey") ?? syncKey
    let hasMore = EasParse.first(coll, page: a, tag: "MoreAvailable") != nil

    var created: [[String: Any]] = []
    var deleted: [String] = []
    let addTok = EasParse.token(a, "Add")
    let changeTok = EasParse.token(a, "Change")
    let deleteTok = EasParse.token(a, "Delete")
    let softTok = EasParse.token(a, "SoftDelete")
    if let commands = EasParse.first(coll, page: a, tag: "Commands") {
      for cmd in commands.children where cmd.page == a {
        if cmd.token == addTok || cmd.token == changeTok {
          guard let serverId = EasParse.childText(cmd, page: a, tag: "ServerId"),
            let appData = EasParse.first(cmd, page: a, tag: "ApplicationData")
          else { continue }
          created.append(
            EasParse.message(
              scope: appData, serverId: serverId, accountId: accountId, folderId: collectionId))
          cacheCollection(serverId, collectionId)
        } else if cmd.token == deleteTok || cmd.token == softTok {
          if let serverId = EasParse.childText(cmd, page: a, tag: "ServerId") {
            deleted.append(serverId)
          }
        }
      }
    }
    return (newKey, created, deleted, hasMore)
  }

  // MARK: getMessage (voller HTML-Body via ItemOperations:Fetch, Code-Page 20)

  func getMessage(accountId: String, messageId: String) async throws -> String {
    guard let collId = collection(forServerId: messageId) else {
      // Collection unbekannt (z. B. nach Neustart) → EWS-Fallback im Router.
      throw EasError.hard("Unbekannte Collection für \(messageId)")
    }
    let io = Wbxml.Page.itemOperations
    let a = Wbxml.Page.airSync
    let b = Wbxml.Page.airSyncBase
    let fetch = Wbxml.el(
      io, "Fetch",
      [
        Wbxml.txt(io, "Store", "Mailbox"),
        Wbxml.txt(a, "CollectionId", collId),
        Wbxml.txt(a, "ServerId", messageId),
        Wbxml.el(io, "Options", [Wbxml.el(b, "BodyPreference", [Wbxml.txt(b, "Type", "2")])]),
      ])
    let req = Wbxml.el(io, "ItemOperations", [fetch])
    let data = try await easSend(accountId, command: "ItemOperations", body: Wbxml.encode(req))
    guard let root = try? Wbxml.decode(data),
      let fetchNode = EasParse.first(root, page: io, tag: "Fetch"),
      let props = EasParse.first(fetchNode, page: io, tag: "Properties")
    else { throw EasError.hard("ItemOperations: Antwort unvollständig") }
    let serverId = EasParse.text(fetchNode, page: a, tag: "ServerId") ?? messageId
    let msg = EasParse.message(
      scope: props, serverId: serverId, accountId: accountId, folderId: collId)
    return NexusJSON.string(from: msg) ?? "{}"
  }
}
