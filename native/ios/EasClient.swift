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

  /// Stellt den EAS-Zustand für ein Konto sicher (lazy): nach App-Neustart bzw. wenn nur über
  /// EWS angemeldet wurde, ist `states` leer. Dann EAS-URL/DeviceId/Version ermitteln und einmal
  /// provisionieren. Schlägt das fehl (Server ohne EAS), wirft es Hardfailure → EWS-Fallback.
  @discardableResult
  private func ensureState(_ accountId: String) async throws -> AccountState {
    if let st = getState(accountId) { return st }
    let urlStr = NexusTransport.shared.easUrlForSession()
    guard !urlStr.isEmpty, let url = URL(string: urlStr) else {
      throw EasError.hard("Keine EAS-URL für die Sitzung")
    }
    let deviceId = try Self.deviceId(for: accountId)
    let user = NexusTransport.shared.sessionUsername() ?? accountId
    let version = try await negotiate(url)
    putState(
      accountId,
      AccountState(
        easUrl: url, protocolVersion: version, policyKey: "0", deviceId: deviceId,
        deviceType: "iPhone", user: user))
    let key = try await provision(accountId)
    setPolicyKey(accountId, key)
    guard let st = getState(accountId) else {
      throw EasError.hard("EAS-Status konnte nicht aufgebaut werden")
    }
    return st
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
    try await ensureState(accountId)
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

  // Aktueller SyncKey je Collection. EAS-Änderungen (Read/Flag/Delete) sind Sync-Commands und
  // brauchen den jeweils gültigen SyncKey. Native gehaltene Autorität (JS-Cursor wird beim
  // nächsten Sync versöhnt). Nach Neustart leer → wird bei Bedarf neu geprimt.
  private var syncKeyForCollection: [String: String] = [:]

  private func setSyncKey(_ collectionId: String, _ key: String) {
    lock.lock()
    defer { lock.unlock() }
    syncKeyForCollection[collectionId] = key
  }
  private func currentSyncKey(_ collectionId: String) -> String? {
    lock.lock()
    defer { lock.unlock() }
    return syncKeyForCollection[collectionId]
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
    try await ensureState(accountId)
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
    let key = EasParse.text(coll, page: a, tag: "SyncKey") ?? "0"
    setSyncKey(collectionId, key)
    return key
  }

  private func syncCollection(
    _ accountId: String, collectionId: String, syncKey: String, retried: Bool = false
  ) async throws -> (newKey: String, created: [[String: Any]], deleted: [String], hasMore: Bool) {
    let a = Wbxml.Page.airSync
    let b = Wbxml.Page.airSyncBase
    // Options: FilterType=4 (2 Wochen) hält den Erst-Sync klein; BodyPreference Type=Text(1) mit
    // 8 KB Truncation. Bewusst KONSERVATIV: Falls der Server die Truncation ignorieren würde,
    // begrenzt schon der kleine WindowSize + FilterType den Speicher (Schutz vor Jetsam). Den
    // vollen HTML-Body holt das Öffnen einzeln via ItemOperations.
    let options = Wbxml.el(
      a, "Options",
      [
        Wbxml.txt(a, "FilterType", "4"),
        Wbxml.el(
          b, "BodyPreference",
          [Wbxml.txt(b, "Type", "1"), Wbxml.txt(b, "TruncationSize", "8192")]),
      ])
    let collection = Wbxml.el(
      a, "Collection",
      [
        Wbxml.txt(a, "SyncKey", syncKey),
        Wbxml.txt(a, "CollectionId", collectionId),
        Wbxml.txt(a, "DeletesAsMoves", "1"),
        Wbxml.txt(a, "GetChanges", "1"),
        Wbxml.txt(a, "WindowSize", "10"),
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
    setSyncKey(collectionId, newKey)
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
    try await ensureState(accountId)
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

  // MARK: SendMail (ComposeMail Page 21)

  func sendMessage(accountId: String, messageJson: String) async throws -> String {
    try await ensureState(accountId)
    guard let msg = NexusJSON.object(from: messageJson) as? [String: Any] else {
      throw EasError.hard("Ungültige Nachricht")
    }
    return try await sendMime(accountId, msg)
  }

  private func sendMime(_ accountId: String, _ msg: [String: Any]) async throws -> String {
    let mime = MimeBuilder.build(msg)
    let cm = Wbxml.Page.composeMail
    let req = Wbxml.el(
      cm, "SendMail",
      [
        Wbxml.txt(cm, "ClientId", UUID().uuidString),
        Wbxml.el(cm, "SaveInSentItems", []),
        Wbxml.txt(cm, "Mime", mime),
      ])
    let data = try await easSend(accountId, command: "SendMail", body: Wbxml.encode(req))
    // Leere Antwort = Erfolg; nicht-leer ⇒ Status prüfen.
    if !data.isEmpty, let root = try? Wbxml.decode(data),
      let status = EasParse.text(root, page: cm, tag: "Status"), status != "1"
    {
      throw EasError.hard("SendMail Status \(status)")
    }
    return NexusJSON.string(from: "sent-\(UUID().uuidString)") ?? "\"sent\""
  }

  // MARK: applyOperation (Read/Flag/Categories/Delete/Move/Send)

  func applyOperation(operationJson: String) async throws {
    guard let op = NexusJSON.object(from: operationJson) as? [String: Any],
      let command = op["command"] as? [String: Any], let type = command["type"] as? String
    else { throw EasError.hard("Ungültige Operation") }
    let accountId = op["accountId"] as? String ?? ""
    try await ensureState(accountId)
    let itemId = command["messageId"] as? String ?? ""
    let e = Wbxml.Page.email

    switch type {
    case "markRead":
      let read = (command["read"] as? Bool) ?? true
      try await changeItem(accountId, serverId: itemId, fields: [Wbxml.txt(e, "Read", read ? "1" : "0")])
    case "flag":
      let on = (command["value"] as? Bool) ?? true
      let flag =
        on
        ? Wbxml.el(e, "Flag", [Wbxml.txt(e, "FlagStatus", "2"), Wbxml.txt(e, "FlagType", "Flag for follow up")])
        : Wbxml.el(e, "Flag", [])
      try await changeItem(accountId, serverId: itemId, fields: [flag])
    case "setCategories":
      let cats = (command["categories"] as? [String]) ?? []
      let nodes = cats.map { Wbxml.txt(e, "Category", $0) }
      try await changeItem(accountId, serverId: itemId, fields: [Wbxml.el(e, "Categories", nodes)])
    case "delete":
      try await deleteItem(accountId, serverId: itemId)
    case "move":
      try await moveItem(
        accountId, serverId: itemId, targetFolderId: command["targetFolderId"] as? String ?? "")
    case "send":
      guard let message = command["message"] as? [String: Any] else {
        throw EasError.hard("send: message fehlt")
      }
      _ = try await sendMime(accountId, message)
    default:
      throw EasError.hard("Unbekannte Operation \(type)")
    }
  }

  private func changeItem(_ accountId: String, serverId: String, fields: [Wbxml.Node]) async throws {
    guard let coll = collection(forServerId: serverId) else {
      throw EasError.hard("Unbekannte Collection für \(serverId)")
    }
    let a = Wbxml.Page.airSync
    let change = Wbxml.el(
      a, "Change", [Wbxml.txt(a, "ServerId", serverId), Wbxml.el(a, "ApplicationData", fields)])
    try await syncCommands(accountId, collectionId: coll, commands: [change])
  }

  private func deleteItem(_ accountId: String, serverId: String) async throws {
    guard let coll = collection(forServerId: serverId) else {
      throw EasError.hard("Unbekannte Collection für \(serverId)")
    }
    let a = Wbxml.Page.airSync
    let del = Wbxml.el(a, "Delete", [Wbxml.txt(a, "ServerId", serverId)])
    try await syncCommands(accountId, collectionId: coll, commands: [del], deletesAsMoves: true)
  }

  /// Sendet Sync-`Commands` (Change/Delete) auf einer Collection; Status 3 → neu primen + 1 Retry.
  private func syncCommands(
    _ accountId: String, collectionId: String, commands: [Wbxml.Node],
    deletesAsMoves: Bool = false, retried: Bool = false
  ) async throws {
    let a = Wbxml.Page.airSync
    let key: String
    if let cached = currentSyncKey(collectionId) {
      key = cached
    } else {
      key = try await primeCollection(accountId, collectionId: collectionId)
    }
    var collChildren: [Wbxml.Node] = [
      Wbxml.txt(a, "SyncKey", key), Wbxml.txt(a, "CollectionId", collectionId),
    ]
    if deletesAsMoves { collChildren.append(Wbxml.txt(a, "DeletesAsMoves", "1")) }
    collChildren.append(Wbxml.el(a, "Commands", commands))
    let req = Wbxml.el(a, "Sync", [Wbxml.el(a, "Collections", [Wbxml.el(a, "Collection", collChildren)])])
    let data = try await easSend(accountId, command: "Sync", body: Wbxml.encode(req))
    if data.isEmpty { return }
    guard let root = try? Wbxml.decode(data), let coll = EasParse.first(root, page: a, tag: "Collection")
    else { throw EasError.hard("Sync(cmd): WBXML/Collection fehlt") }
    let status = EasParse.text(coll, page: a, tag: "Status") ?? "?"
    if status == "3", !retried {
      _ = try await primeCollection(accountId, collectionId: collectionId)
      return try await syncCommands(
        accountId, collectionId: collectionId, commands: commands, deletesAsMoves: deletesAsMoves,
        retried: true)
    }
    guard status == "1" else { throw EasError.hard("Sync(cmd) Status \(status)") }
    if let newKey = EasParse.text(coll, page: a, tag: "SyncKey") { setSyncKey(collectionId, newKey) }
  }

  /// MoveItems (Code-Page 5). `targetFolderId` ist die Ziel-CollectionId (FolderSync-ServerId).
  /// Logische Namen (z. B. „archive") lassen sich hier nicht auflösen → Hardfailure.
  private func moveItem(_ accountId: String, serverId: String, targetFolderId: String) async throws {
    guard let srcColl = collection(forServerId: serverId) else {
      throw EasError.hard("Unbekannte Collection für \(serverId)")
    }
    let m = Wbxml.Page.move
    let req = Wbxml.el(
      m, "MoveItems",
      [
        Wbxml.el(
          m, "Move",
          [
            Wbxml.txt(m, "SrcMsgId", serverId),
            Wbxml.txt(m, "SrcFldId", srcColl),
            Wbxml.txt(m, "DstFldId", targetFolderId),
          ])
      ])
    let data = try await easSend(accountId, command: "MoveItems", body: Wbxml.encode(req))
    if data.isEmpty { return }
    if let root = try? Wbxml.decode(data) {
      let status = EasParse.text(root, page: m, tag: "Status") ?? "3"
      guard status == "3" else { throw EasError.hard("MoveItems Status \(status)") }  // 3 = Erfolg
      if let dstId = EasParse.text(root, page: m, tag: "DstMsgId") {
        cacheCollection(dstId, targetFolderId)
      }
    }
  }

  // MARK: Ping / Direct Push (Code-Page 13)

  /// Echtes EAS-Long-Poll: hält die Verbindung bis `HeartbeatInterval` oder bis sich ein Ordner
  /// ändert. Liefert das `PingResult`-JSON (`{status, changedFolderIds}`). `folderIds` sind die
  /// CollectionIds (FolderSync-ServerIds).
  func ping(accountId: String, folderIdsJson: String, timeoutSec: Double) async throws -> String {
    try await ensureState(accountId)
    let folders = (NexusJSON.object(from: folderIdsJson) as? [String]) ?? []
    let heartbeat = Int(min(max(timeoutSec, 1), 600))
    let p = Wbxml.Page.ping
    var folderNodes: [Wbxml.Node] = []
    for fid in folders {
      folderNodes.append(
        Wbxml.el(p, "Folder", [Wbxml.txt(p, "Id", fid), Wbxml.txt(p, "Class", "Email")]))
    }
    let req = Wbxml.el(
      p, "Ping",
      [Wbxml.txt(p, "HeartbeatInterval", String(heartbeat)), Wbxml.el(p, "Folders", folderNodes)])
    let data = try await easSend(accountId, command: "Ping", body: Wbxml.encode(req))
    let empty = [String]()
    if data.isEmpty {
      return NexusJSON.string(from: ["status": "timeout", "changedFolderIds": empty]) ?? "{}"
    }
    guard let root = try? Wbxml.decode(data) else {
      return NexusJSON.string(from: ["status": "error", "changedFolderIds": empty]) ?? "{}"
    }
    let status = EasParse.text(root, page: p, tag: "Status") ?? "0"
    switch status {
    case "2":  // Änderungen — die Folder-Elemente enthalten die geänderten CollectionIds (als Text).
      var changed: [String] = []
      for f in EasParse.all(root, page: p, tag: "Folder") {
        if let id = f.text, !id.isEmpty { changed.append(id) }
      }
      return NexusJSON.string(from: ["status": "changed", "changedFolderIds": changed]) ?? "{}"
    case "1", "5", "7":  // Heartbeat abgelaufen / out-of-range / Hierarchie geändert → kein Item-Delta
      return NexusJSON.string(from: ["status": "timeout", "changedFolderIds": empty]) ?? "{}"
    default:
      return NexusJSON.string(from: ["status": "error", "changedFolderIds": empty]) ?? "{}"
    }
  }

  // MARK: Anhang laden (ItemOperations:Fetch per FileReference)

  func getAttachment(accountId: String, attachmentId: String) async throws -> String {
    try await ensureState(accountId)
    let io = Wbxml.Page.itemOperations
    let b = Wbxml.Page.airSyncBase
    let fetch = Wbxml.el(
      io, "Fetch", [Wbxml.txt(io, "Store", "Mailbox"), Wbxml.txt(b, "FileReference", attachmentId)])
    let req = Wbxml.el(io, "ItemOperations", [fetch])
    let data = try await easSend(accountId, command: "ItemOperations", body: Wbxml.encode(req))
    guard let root = try? Wbxml.decode(data),
      let fetchNode = EasParse.first(root, page: io, tag: "Fetch")
    else { throw EasError.hard("ItemOperations(att): Antwort unvollständig") }
    let props = EasParse.first(fetchNode, page: io, tag: "Properties")
    // Data kann unter ItemOperations (Page 20) ODER AirSyncBase (Page 17) liegen — beides prüfen.
    let base64 =
      (props.flatMap { EasParse.text($0, page: io, tag: "Data") })
      ?? (props.flatMap { EasParse.text($0, page: b, tag: "Data") })
      ?? EasParse.text(fetchNode, page: io, tag: "Data")
      ?? EasParse.text(fetchNode, page: b, tag: "Data") ?? ""
    let contentType =
      (props.flatMap { EasParse.text($0, page: b, tag: "ContentType") })
      ?? "application/octet-stream"
    return NexusJSON.string(from: [
      "id": attachmentId, "name": "Anhang", "contentType": contentType, "base64": base64,
    ]) ?? "{}"
  }
}
