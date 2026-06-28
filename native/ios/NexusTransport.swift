import Foundation
import UIKit

/// Exchange-Transport (EWS) mit Autodiscover, TLS, Certificate Pinning und Auth
/// (Basic + NTLM). Ergebnisse als JSON über die Bridge. NTLM wird vom System über die
/// URLSession-Challenge abgewickelt; Basic wird zusätzlich preemptiv als Header gesetzt.
/// EAS/WBXML und Kerberos folgen iterativ (siehe docs/11-Native-und-App.md).
final class NexusTransport: NSObject, URLSessionDelegate {
  static let shared = NexusTransport()

  // Aller veränderliche Laufzeit-Zustand wird über `stateLock` synchronisiert: er wird aus
  // async-Tasks, dem (nebenläufigen) URLSession-Delegate UND dem Hintergrund-Task gelesen/
  // geschrieben. WICHTIG: Das Lock wird IMMER nur kurz um reine Speicherzugriffe gehalten —
  // NIE über ein `await`/einen Netzaufruf hinweg (sonst Deadlock/Serialisierung). Zugriff
  // ausschließlich über die thread-sicheren Accessor-Helfer unten.
  private let stateLock = NSLock()
  private var _ewsUrl: URL?
  private var _basicAuthHeader: String?
  private var _username: String?
  private var _password: String?
  /// Konto-Wunsch „EWS bevorzugen" (Kompatibilitätsmodus). true ⇒ EAS für die Sitzung aus.
  private var _preferEws = false
  private var _pinPolicies: [PinPolicy] = []
  /// Aus JS gesetzte Basis-Pins (statische Policy); die effektiven `_pinPolicies` sind Basis +
  /// TOFU-Pins (vom Nutzer beim ersten Login bestätigt, im Keychain persistiert).
  private var _basePinPolicies: [PinPolicy] = []
  /// Pro Ordner gemerkte Signatur für DirectPush-Änderungserkennung (Ping/Long-Poll).
  private var _folderSignatures: [String: String] = [:]

  /// Certificate-Pinning-Policy (siehe core-transport/pinning.ts). Leer ⇒ Pinning inaktiv.
  struct PinPolicy {
    let host: String
    let includeSubdomains: Bool
    let pins: [String]
  }

  // Eager initialisiert (kein `lazy`): die nebenläufige Erst-Initialisierung einer `lazy var`
  // ist nicht thread-safe — bei parallelen Tasks (sync + ping) drohte ein Init-Race.
  private var session: URLSession!

  override init() {
    super.init()
    let config = URLSessionConfiguration.ephemeral
    config.tlsMinimumSupportedProtocolVersion = .TLSv12
    session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }

  /// Führt `body` unter dem State-Lock aus. NUR für kurze Speicherzugriffe — niemals `await`.
  private func locked<T>(_ body: () -> T) -> T {
    stateLock.lock()
    defer { stateLock.unlock() }
    return body()
  }

  /// EWS-Endpunkt (thread-safe).
  var ewsUrl: URL? {
    get { locked { _ewsUrl } }
    set { locked { _ewsUrl = newValue } }
  }
  /// „EWS bevorzugen" der aktuellen Sitzung (thread-safe).
  var preferEwsSession: Bool {
    get { locked { _preferEws } }
    set { locked { _preferEws = newValue } }
  }
  /// Preemptiver Basic-Auth-Header (thread-safe).
  var basicAuthHeader: String? {
    get { locked { _basicAuthHeader } }
    set { locked { _basicAuthHeader = newValue } }
  }

  /// Setzt Benutzer + Passwort + Basic-Header atomar (verhindert inkonsistente Teil-Updates).
  private func setCredentials(username: String, password: String, header: String) {
    locked {
      _username = username
      _password = password
      _basicAuthHeader = header
    }
  }
  /// Liest Benutzer + Passwort atomar (URLSession-Auth-Challenge — beide zusammen oder keiner).
  private func basicCredentials() -> (user: String, pass: String)? {
    locked {
      guard let u = _username, let p = _password else { return nil }
      return (u, p)
    }
  }
  /// Aktueller Benutzername (thread-safe).
  private func currentUsername() -> String? { locked { _username } }

  /// Gemerkte Ordner-Signatur lesen/schreiben (thread-safe — Dictionary ist nicht nebenläufig).
  private func cachedSignature(for folderId: String) -> String? {
    locked { _folderSignatures[folderId] }
  }
  private func cacheSignature(_ signature: String, for folderId: String) {
    locked { _folderSignatures[folderId] = signature }
  }

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
      if let cred = basicCredentials() {
        completionHandler(
          .useCredential,
          URLCredential(user: cred.user, password: cred.pass, persistence: .forSession))
      } else {
        completionHandler(.performDefaultHandling, nil)
      }
    default:
      completionHandler(.performDefaultHandling, nil)
    }
  }

  /// Redirects: einen evtl. gesetzten Authorization-Header entfernen, wenn die Umleitung NICHT
  /// auf https zeigt (Defense-in-Depth gegen Klartext-Credential-Leak über einen 30x-Redirect).
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    var req = request
    if req.url?.scheme?.lowercased() != "https" {
      req.setValue(nil, forHTTPHeaderField: "Authorization")
    }
    completionHandler(req)
  }

  // MARK: Autodiscover

  func discover(email: String, credentialsJson: String) async throws -> String {
    guard let domain = email.split(separator: "@").last.map(String.init)?.lowercased() else {
      throw NexusError.transport("Ungültige E-Mail-Adresse")
    }
    let creds = Self.jsonObject(credentialsJson) as? [String: Any]
    // Protokollwahl der Einrichtung übernehmen (true ⇒ EAS für die Sitzung aus).
    preferEwsSession = (creds?["preferEws"] as? Bool) ?? false

    // Login-Namen ggf. um die NetBIOS-Domäne ergänzen (NTLM erwartet DOMÄNE\Benutzer).
    if let user = creds?["username"] as? String, let secret = creds?["secret"] as? String {
      let netbios = creds?["domain"] as? String
      let effectiveUser =
        (netbios != nil && !user.contains("\\") && !user.contains("@"))
        ? "\(netbios!)\\\(user)" : user
      setCredentials(
        username: effectiveUser, password: secret,
        header: Self.basicAuth(user: effectiveUser, password: secret))
    }
    let scheme = (creds?["scheme"] as? String) ?? "basic"

    // 1) Manueller Modus: Autodiscover überspringen, feste EWS-URL verwenden.
    if let manual = creds?["manual"] as? [String: Any],
      let manualEws = manual["ewsUrl"] as? String, let url = URL(string: manualEws) {
      ewsUrl = url
      let manualEas = (manual["easUrl"] as? String) ?? Self.defaultEasUrl(forEwsHost: url.host)
      return try Self.json([
        "emailAddress": email, "auth": scheme, "ewsUrl": manualEws, "easUrl": manualEas,
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
        "easUrl": Self.defaultEasUrl(forEwsHost: URL(string: ews)?.host),
        "capabilities": Self.defaultCapabilities,
      ])
    }

    // 3) EWS-Direkt-Fallbacks, falls Autodiscover nichts liefert (Standardpfade).
    let fallbacks = [
      "https://mail.\(domain)/EWS/Exchange.asmx",
      "https://autodiscover.\(domain)/EWS/Exchange.asmx",
      "https://exchange.\(domain)/EWS/Exchange.asmx",
      "https://webmail.\(domain)/EWS/Exchange.asmx",
      "https://owa.\(domain)/EWS/Exchange.asmx",
      "https://\(domain)/EWS/Exchange.asmx",
    ]
    for fb in fallbacks {
      guard let url = URL(string: fb) else { continue }
      if try await probeEwsEndpoint(url) {
        ewsUrl = url
        return try Self.json([
          "emailAddress": email, "auth": scheme, "ewsUrl": fb,
          "easUrl": Self.defaultEasUrl(forEwsHost: url.host),
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
      // -999 „cancelled" entsteht, wenn der Server eine Auth-Challenge schickt (Basic/NTLM/
      // Negotiate) und der Handler nach einem Fehlversuch abbricht — d. h. ein EWS-Endpunkt
      // existiert dort. Als Treffer werten, damit der Server trotzdem gefunden wird.
      let ns = error as NSError
      return ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled
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
    // Anmeldedaten NUR über https mitsenden — niemals über die http-Redirect-Probe (Schritt 3),
    // sonst ginge das Passwort im Klartext über das Netz (MITM). Diese Probe dient nur dazu,
    // den 301/302-Redirect zum https-Endpunkt zu finden.
    if url.scheme?.lowercased() == "https", let auth = basicAuthHeader {
      req.setValue(auth, forHTTPHeaderField: "Authorization")
    }
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

  /// Setzt die Basis-Pinning-Policy aus JSON (`{ policies: [{ host, pins, includeSubdomains }] }`)
  /// und baut die effektiven Pins (Basis + TOFU) neu auf.
  func configurePinning(_ json: String) {
    let parsed: [PinPolicy]
    if let obj = Self.jsonObject(json) as? [String: Any],
      let policies = obj["policies"] as? [[String: Any]]
    {
      parsed = policies.compactMap { p in
        guard let host = p["host"] as? String, let pins = p["pins"] as? [String], !pins.isEmpty
        else { return nil }
        return PinPolicy(
          host: host.lowercased(), includeSubdomains: (p["includeSubdomains"] as? Bool) ?? false,
          pins: pins)
      }
    } else {
      parsed = []
    }
    locked { _basePinPolicies = parsed }
    rebuildPinPolicies()
  }

  /// Effektive Pins = Basis-Policy + persistierte TOFU-Pins (Keychain).
  private func rebuildPinPolicies() {
    let base = locked { _basePinPolicies }
    let tofu = Self.tofuPolicies()
    locked { _pinPolicies = base + tofu }
  }

  // MARK: TOFU (Trust-on-First-Use) Zertifikat-Pinning

  /// Liest das Server-Zertifikat (SPKI-Fingerprint + Subject), OHNE etwas zu vertrauen — der
  /// Nutzer bestätigt es im Setup. Separate, kurzlebige URLSession (bricht in der Challenge ab).
  func probeCertificate(host: String) async throws -> String {
    let cleanHost = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !cleanHost.isEmpty, let url = URL(string: "https://\(cleanHost)/") else {
      throw NexusError.transport("Ungültiger Host")
    }
    let probe = NexusCertProbe()
    let cfg = URLSessionConfiguration.ephemeral
    cfg.tlsMinimumSupportedProtocolVersion = .TLSv12
    cfg.timeoutIntervalForRequest = 15
    let probeSession = URLSession(configuration: cfg, delegate: probe, delegateQueue: nil)
    defer { probeSession.invalidateAndCancel() }
    var req = URLRequest(url: url)
    req.httpMethod = "HEAD"
    _ = try? await probeSession.data(for: req)  // bricht in der Challenge ab → Fehler ignorieren
    guard !probe.spki.isEmpty else { throw NexusError.transport("Kein Zertifikat empfangen") }
    return try Self.json(["host": cleanHost, "spkiSha256": probe.spki, "subject": probe.subject])
  }

  /// Speichert einen vom Nutzer bestätigten SPKI-Pin für den Host (Keychain) und aktiviert ihn
  /// sofort. Ab dann wird TLS für diesen Host streng gegen den Pin geprüft (fail-closed).
  func trustCertificate(host: String, spkiSha256: String) async throws {
    let cleanHost = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let pin = spkiSha256.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleanHost.isEmpty, !pin.isEmpty else { throw NexusError.transport("Ungültige Pin-Daten") }
    var store = Self.loadTofuStore()
    var pins = store[cleanHost] ?? []
    if !pins.contains(pin) { pins.append(pin) }
    store[cleanHost] = pins
    try Self.saveTofuStore(store)
    rebuildPinPolicies()
  }

  private static func loadTofuStore() -> [String: [String]] {
    // `try?` flacht das optionale Ergebnis von get() bereits ab → `json` ist String (nicht String??).
    guard let json = try? NexusSecureStore.get("nexus:tofu"),
      let obj = Self.jsonObject(json) as? [String: [String]]
    else { return [:] }
    return obj
  }
  private static func saveTofuStore(_ store: [String: [String]]) throws {
    try NexusSecureStore.set("nexus:tofu", value: NexusJSON.string(from: store) ?? "{}")
  }
  private static func tofuPolicies() -> [PinPolicy] {
    loadTofuStore().compactMap { (host, pins) in
      pins.isEmpty ? nil : PinPolicy(host: host, includeSubdomains: false, pins: pins)
    }
  }

  /// Findet die spezifischste passende Policy für `host` (exakt vor Subdomain-Wildcard).
  private func pinPolicy(for host: String) -> PinPolicy? {
    let h = host.lowercased()
    let policies = locked { _pinPolicies }
    if let exact = policies.first(where: { $0.host == h }) { return exact }
    return policies.first { $0.includeSubdomains && h.hasSuffix(".\($0.host)") }
  }

  // MARK: DirectPush (Ping / Long-Poll)

  /// Bounded Long-Poll: kehrt zurück, sobald sich in einem der Ordner etwas ändert, sonst nach
  /// `timeoutSec`. Änderungserkennung über eine FindItem-Signatur (Anzahl + neuste Item-ID).
  /// Der erste Aufruf setzt die Basislinie. (Vollwertiges EAS-Ping/WBXML folgt iterativ.)
  func ping(accountId: String, folderIdsJson: String, timeoutSec: Double) async throws -> String {
    if useEas(accountId) {
      do {
        return try await EasClient.shared.ping(
          accountId: accountId, folderIdsJson: folderIdsJson, timeoutSec: timeoutSec)
      } catch let e as EasClient.EasError where e.isHard {
        return try await pingEws(accountId: accountId, folderIdsJson: folderIdsJson, timeoutSec: timeoutSec)
      }
    }
    return try await pingEws(accountId: accountId, folderIdsJson: folderIdsJson, timeoutSec: timeoutSec)
  }

  /// EWS-Ersatz-Push (Long-Poll über FindItem-Signatur), Fallback wenn EAS-Ping nicht verfügbar.
  private func pingEws(accountId: String, folderIdsJson: String, timeoutSec: Double) async throws
    -> String
  {
    let folders =
      (Self.jsonObject(folderIdsJson) as? [String]) ?? []
    // Timeout defensiv begrenzen (1 s … 10 min), damit ein fehlerhafter JS-Wert keinen
    // quasi-endlosen Long-Poll/Resource-Hang auslöst.
    let boundedTimeout = min(max(timeoutSec, 1), 600)
    let deadline = Date().addingTimeInterval(boundedTimeout)
    let pollInterval: UInt64 = 15_000_000_000  // 15 s

    while Date() < deadline {
      var changed: [String] = []
      for folderId in folders {
        let signature = try await folderSignature(folderId)
        if let previous = cachedSignature(for: folderId), previous != signature {
          changed.append(folderId)
        }
        cacheSignature(signature, for: folderId)
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
    if useEas(accountId) {
      do {
        let result = try await EasClient.shared.syncMessages(
          accountId: accountId, folderId: folderId, syncKey: syncKey)
        recordProtocol("eas", for: accountId)
        return result
      } catch let e as EasClient.EasError where e.isHard {
        recordProtocol("ews", for: accountId)  // EAS-Hardfailure → automatischer EWS-Fallback
        return try await syncMessagesEws(accountId: accountId, folderId: folderId, syncKey: syncKey)
      }
    }
    recordProtocol("ews", for: accountId)
    return try await syncMessagesEws(accountId: accountId, folderId: folderId, syncKey: syncKey)
  }

  /// Zuletzt tatsächlich genutztes Mail-Protokoll je Konto (für die UI-Anzeige).
  private var _lastProtocol: [String: String] = [:]
  private func recordProtocol(_ proto: String, for accountId: String) {
    locked { _lastProtocol[accountId] = proto }
  }
  /// „eas" | „ews" | „unbekannt" (noch kein Sync gelaufen).
  func activeProtocol(accountId: String) async throws -> String {
    try Self.json(["protocol": locked { _lastProtocol[accountId] } ?? "unbekannt"])
  }

  private func syncMessagesEws(accountId: String, folderId: String, syncKey: String?) async throws
    -> String
  {
    let syncXml = try await post(EwsSoap.syncFolderItems(folderId: mapFolder(folderId), syncState: syncKey))
    let changes = EwsSoap.parseSyncChanges(syncXml)
    let newState = EwsSoap.extractSyncState(syncXml) ?? (syncKey ?? "")
    var created: [[String: Any]] = []
    if !changes.upsertIds.isEmpty {
      // In Blöcken holen (große Erst-Syncs nicht in einen Riesen-Request packen).
      for chunk in stride(from: 0, to: changes.upsertIds.count, by: 20) {
        let slice = Array(changes.upsertIds[chunk..<min(chunk + 20, changes.upsertIds.count)])
        // Listen-Sync bewusst mit Text-Body (klein) — der HTML-Body wird beim Öffnen je Mail
        // einzeln nachgeladen. Verhindert den Speicher-Spike/Jetsam bei HTML-Mails mit Inline-Bildern.
        let itemsXml = try await post(EwsSoap.getItemsSync(ids: slice))
        created.append(
          contentsOf: EwsSoap.parseItems(itemsXml).map {
            Self.messageJson($0, accountId: accountId, folderId: folderId)
          })
      }
    }
    let delta: [String: Any] = [
      "syncKey": newState, "created": created, "updated": [],
      "deletedIds": changes.deletedIds, "hasMore": !changes.includesLast,
    ]
    return try Self.json(delta)
  }

  // MARK: Freigegebene Postfächer (Delegation)

  /// Prüft SERVERSEITIG, ob der angemeldete Nutzer auf das Postfach `owner` zugreifen darf
  /// (GetFolder auf dessen Posteingang mit Mailbox-Targeting). Erfolg ⇒ JSON {email}. Ohne
  /// Berechtigung antwortet EWS mit ErrorAccessDenied → „FORBIDDEN" (Hinzufügen wird abgelehnt).
  /// So kann ein Nutzer nur Postfächer hinzufügen/öffnen, für die er tatsächlich berechtigt ist.
  func verifySharedMailbox(owner: String) async throws -> String {
    let mb = owner.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard mb.contains("@") else { throw NexusError.transport("INVALID: Ungültige Adresse") }
    let xml = try await post(EwsSoap.getFolder(distinguished: "inbox", mailbox: mb))
    guard EwsSoap.isSuccess(xml) else {
      throw NexusError.transport("FORBIDDEN: \(EwsSoap.responseCode(xml) ?? "ErrorAccessDenied")")
    }
    return try Self.json(["email": mb])
  }

  /// Liest (nur lesend) Posteingangs-Nachrichten eines freigegebenen Postfachs. Der Server
  /// erzwingt die Rechte erneut (ErrorAccessDenied ⇒ FORBIDDEN). Liefert JSON {messages:[…]}.
  func syncSharedInbox(owner: String) async throws -> String {
    let mb = owner.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard mb.contains("@") else { throw NexusError.transport("INVALID: Ungültige Adresse") }
    let findXml = try await post(EwsSoap.findItem(folderId: "inbox", query: "", mailbox: mb))
    guard EwsSoap.isSuccess(findXml) else {
      throw NexusError.transport("FORBIDDEN: \(EwsSoap.responseCode(findXml) ?? "ErrorAccessDenied")")
    }
    let ids = Array(EwsSoap.extractItemIds(findXml).prefix(50))
    var messages: [[String: Any]] = []
    if !ids.isEmpty {
      let itemsXml = try await post(EwsSoap.getItems(ids: ids))
      messages = EwsSoap.parseItems(itemsXml).map {
        Self.messageJson($0, accountId: "shared:\(mb)", folderId: "inbox")
      }
    }
    return try Self.json(["messages": messages])
  }

  /// Holt den Anhangs-Inhalt — EAS via ItemOperations:Fetch(FileReference), sonst EWS GetAttachment.
  private func attachmentContent(accountId: String, attachmentId: String) async throws -> (
    name: String, contentType: String, base64: String
  ) {
    if useEas(accountId) {
      do {
        let json = try await EasClient.shared.getAttachment(
          accountId: accountId, attachmentId: attachmentId)
        let obj = (Self.jsonObject(json) as? [String: Any]) ?? [:]
        return (
          obj["name"] as? String ?? "Anhang",
          obj["contentType"] as? String ?? "application/octet-stream",
          obj["base64"] as? String ?? ""
        )
      } catch let e as EasClient.EasError where e.isHard { /* EWS-Fallback unten */ }
    }
    let xml = try await post(EwsSoap.getAttachment(id: attachmentId))
    let a = EwsSoap.parseAttachmentContent(xml)
    return (a.name, a.contentType, a.base64)
  }

  func getAttachment(accountId: String, attachmentId: String) async throws -> String {
    let c = try await attachmentContent(accountId: accountId, attachmentId: attachmentId)
    let size = c.base64.isEmpty ? 0 : (c.base64.count * 3) / 4
    return try Self.json([
      "id": attachmentId, "name": c.name, "contentType": c.contentType,
      "sizeBytes": size, "base64": c.base64,
    ])
  }

  /// Lädt einen Anhang, dekodiert ihn NATIV in eine Datei (sandboxed, kein Base64 im JS-Heap
  /// → kleinerer Speicher-Footprint) und öffnet das System-Teilen-Blatt (H9). So lassen sich
  /// Anhänge tatsächlich ansehen/speichern/weitergeben, statt nur eine Meldung anzuzeigen.
  func presentAttachment(accountId: String, attachmentId: String) async throws {
    let a = try await attachmentContent(accountId: accountId, attachmentId: attachmentId)
    guard let data = Data(base64Encoded: a.base64) else {
      throw NexusError.transport("Anhang konnte nicht dekodiert werden")
    }
    // Frisch geleertes, app-privates Temp-Verzeichnis (iOS verschlüsselt at-rest) — vermeidet
    // das Anhäufen entschlüsselter Anhänge auf der Platte.
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(
      "nexus-attachments", isDirectory: true)
    try? FileManager.default.removeItem(at: dir)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let name = a.name.isEmpty ? "Anhang" : a.name
    let fileURL = dir.appendingPathComponent(Self.sanitizeFilename(name))
    try data.write(to: fileURL, options: .atomic)
    await Self.presentShareSheet(fileURL: fileURL)
  }

  /// Entfernt Pfadtrenner/Steuerzeichen aus einem Anhangsnamen (Schutz vor Pfad-Traversal).
  private static func sanitizeFilename(_ name: String) -> String {
    let illegal = CharacterSet(charactersIn: "/\\:\0").union(.controlCharacters)
    let cleaned = name.components(separatedBy: illegal).joined(separator: "_")
    return cleaned.isEmpty ? "Anhang" : cleaned
  }

  /// Präsentiert das UIActivityViewController-Teilen-Blatt für `fileURL` (immer auf dem Main-Thread).
  @MainActor
  private static func presentShareSheet(fileURL: URL) {
    let vc = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    guard let root = top else { return }
    // iPad: Popover verankern, sonst stürzt die Präsentation ab.
    if let pop = vc.popoverPresentationController {
      pop.sourceView = root.view
      pop.sourceRect = CGRect(x: root.view.bounds.midX, y: root.view.bounds.midY, width: 0, height: 0)
      pop.permittedArrowDirections = []
    }
    root.present(vc, animated: true)
  }

  func applyOperation(operationJson: String) async throws {
    let accountId = (Self.jsonObject(operationJson) as? [String: Any])?["accountId"] as? String ?? ""
    if useEas(accountId) {
      do {
        try await EasClient.shared.applyOperation(operationJson: operationJson)
        return
      } catch let e as EasClient.EasError where e.isHard {
        try await applyOperationEws(operationJson: operationJson)
        return
      }
    }
    try await applyOperationEws(operationJson: operationJson)
  }

  private func applyOperationEws(operationJson: String) async throws {
    let op = Self.jsonObject(operationJson) as? [String: Any]
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
      // Die Outbox stellt 'send' hier zu (idempotenter Retry-Pfad). Das vollständige
      // OutgoingMessage steckt in command["message"].
      if let message = command["message"] as? [String: Any] {
        try await deliver(message)
      } else {
        throw NexusError.transport("send: message fehlt")
      }
    default:
      throw NexusError.transport("Unbekannter OutboxCommand: \(type)")
    }
  }

  func loadAccount(accountId: String) async throws -> String {
    try Self.json([
      "id": accountId, "emailAddress": "", "displayName": accountId, "serverHost": ewsUrl?.host ?? "",
    ])
  }

  // MARK: EAS-Routing (Hardfailure ⇒ EWS-Fallback)
  // EAS ist AKTIV: Pro Methode wird zuerst EAS versucht; bei EasError.hard (EAS gesperrt,
  // Provisioning abgelehnt, keine unterstützte Version, kaputtes WBXML) fällt das Konto
  // automatisch auf den EWS-Pfad zurück. Der frühere „Crash nach Login" lag NICHT an EAS,
  // sondern an einem JS-`null` für einen NSString-Bridge-Parameter (-[NSNull length]) — behoben.
  // Sollte im EAS-Pfad doch eine NSException/ein Trap auftreten, hält der Crash-Recorder
  // (NexusCrashReporter) den exakten Grund fest.
  private static let easEnabled = true
  private func useEas(_ accountId: String) -> Bool {
    Self.easEnabled && ewsUrl?.host != nil && !preferEwsSession
  }

  /// EAS-URL der aktuellen Sitzung (Standardpfad aus dem EWS-Host) — für `EasClient.ensureState`.
  func easUrlForSession() -> String { Self.defaultEasUrl(forEwsHost: ewsUrl?.host) }
  /// Benutzername der aktuellen Sitzung (EAS `User`-Parameter).
  func sessionUsername() -> String? { currentUsername() }

  func syncFolders(accountId: String, syncKey: String?) async throws -> String {
    if useEas(accountId) {
      do { return try await EasClient.shared.syncFolders(accountId: accountId, syncKey: syncKey) }
      catch let e as EasClient.EasError where e.isHard {
        return try await syncFoldersEws(accountId: accountId, syncKey: syncKey)
      }
    }
    return try await syncFoldersEws(accountId: accountId, syncKey: syncKey)
  }

  private func syncFoldersEws(accountId: String, syncKey: String?) async throws -> String {
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
    let xml = try await post(EwsSoap.syncFolderItemsIdOnly(distinguished: "calendar", syncState: syncKey))
    let ids = EwsSoap.extractItemIds(xml)
    let newState = EwsSoap.extractSyncState(xml) ?? (syncKey ?? "")
    var created: [[String: Any]] = []
    if !ids.isEmpty {
      created = EwsSoap.parseEvents(try await post(EwsSoap.getItemsLight(ids: ids))).map { (e) in
        [
          "id": e.id, "accountId": accountId, "subject": e.subject, "startAt": e.start, "endAt": e.end,
          "isAllDay": false, "location": e.location,
          "organizer": ["address": e.organizer], "attendees": [],
        ]
      }
    }
    return try Self.json(["syncKey": newState, "created": created, "updated": [], "deletedIds": [], "hasMore": false])
  }

  func syncContacts(accountId: String, syncKey: String?) async throws -> String {
    let xml = try await post(EwsSoap.syncFolderItemsIdOnly(distinguished: "contacts", syncState: syncKey))
    let ids = EwsSoap.extractItemIds(xml)
    let newState = EwsSoap.extractSyncState(xml) ?? (syncKey ?? "")
    var created: [[String: Any]] = []
    if !ids.isEmpty {
      created = EwsSoap.parseContacts(try await post(EwsSoap.getItemsLight(ids: ids))).map { (c) in
        [
          "id": c.id, "accountId": accountId, "displayName": c.displayName,
          "emailAddresses": c.email.isEmpty ? [] : [["address": c.email]],
        ]
      }
    }
    return try Self.json(["syncKey": newState, "created": created, "updated": [], "deletedIds": [], "hasMore": false])
  }

  func getMessage(accountId: String, messageId: String) async throws -> String {
    if useEas(accountId) {
      do { return try await EasClient.shared.getMessage(accountId: accountId, messageId: messageId) }
      catch let e as EasClient.EasError where e.isHard {
        return try await getMessageEws(accountId: accountId, messageId: messageId)
      }
    }
    return try await getMessageEws(accountId: accountId, messageId: messageId)
  }

  private func getMessageEws(accountId: String, messageId: String) async throws -> String {
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
    if useEas(accountId) {
      do { return try await EasClient.shared.sendMessage(accountId: accountId, messageJson: messageJson) }
      catch let e as EasClient.EasError where e.isHard {
        return try await sendMessageEws(accountId: accountId, messageJson: messageJson)
      }
    }
    return try await sendMessageEws(accountId: accountId, messageJson: messageJson)
  }

  private func sendMessageEws(accountId: String, messageJson: String) async throws -> String {
    let msg = (Self.jsonObject(messageJson) as? [String: Any]) ?? [:]
    try await deliver(msg)
    return try Self.json("sent-\(UUID().uuidString)")
  }

  /// Baut aus einem OutgoingMessage-Dict den CreateItem-SOAP und versendet ihn (EWS).
  /// Wird von `sendMessage` UND vom Outbox-`send`-Befehl (`applyOperation`) genutzt.
  /// Baut den EWS-CreateItem-Request aus einer OutgoingMessage (gemeinsam für Senden + Entwurf).
  private func buildCreateItem(_ msg: [String: Any], disposition: String, savedFolder: String?)
    -> String
  {
    let from = (msg["from"] as? [String: Any])?["address"] as? String ?? ""
    let sender = (msg["sender"] as? [String: Any])?["address"] as? String
    let subject = msg["subject"] as? String ?? ""
    let body = (msg["body"] as? [String: Any])?["content"] as? String ?? ""
    let recipients = msg["recipients"] as? [[String: Any]] ?? []
    func addresses(kind: String) -> [String] {
      recipients
        .filter { ($0["kind"] as? String) == kind }
        .compactMap { ($0["address"] as? [String: Any])?["address"] as? String }
    }
    let attachments = (msg["attachments"] as? [[String: Any]] ?? []).compactMap {
      (a) -> (name: String, contentType: String, base64: String)? in
      guard let b64 = a["contentBase64"] as? String, !b64.isEmpty else { return nil }
      return (
        a["name"] as? String ?? "Anhang",
        a["contentType"] as? String ?? "application/octet-stream",
        b64
      )
    }
    return EwsSoap.createItem(
      from: from, sender: sender,
      to: addresses(kind: "to"), cc: addresses(kind: "cc"), bcc: addresses(kind: "bcc"),
      subject: subject, body: body,
      attachments: attachments, disposition: disposition, savedFolder: savedFolder)
  }

  private func deliver(_ msg: [String: Any]) async throws {
    _ = try await post(buildCreateItem(msg, disposition: "SendAndSaveCopy", savedFolder: nil))
  }

  /// Speichert die Nachricht als ENTWURF (EWS CreateItem MessageDisposition=SaveOnly → Ordner
  /// „Entwürfe"), ohne sie zu senden. Liefert die erzeugte Item-ID als JSON {id}.
  func saveDraft(accountId: String, messageJson: String) async throws -> String {
    guard let msg = Self.jsonObject(messageJson) as? [String: Any] else {
      throw NexusError.transport("Ungültige Nachricht")
    }
    let xml = try await post(buildCreateItem(msg, disposition: "SaveOnly", savedFolder: "drafts"))
    guard EwsSoap.isSuccess(xml) else {
      throw NexusError.transport("SERVER: \(EwsSoap.responseCode(xml) ?? "Entwurf fehlgeschlagen")")
    }
    return try Self.json(["id": EwsSoap.extractItemIds(xml).first ?? ""])
  }

  /// Anmeldeprüfung: genau ein authentifizierter EWS-Roundtrip (FindFolder auf der
  /// Postfach-Wurzel). `post()` wirft AUTH bei 401/403 bzw. SERVER bei sonstigem Nicht-200 —
  /// damit werden falsche Anmeldedaten verlässlich abgelehnt (kein „Pseudo-Login").
  func verifyCredentials(email: String) async throws -> String {
    _ = try await post(EwsSoap.findFolders())
    return try Self.json(["verified": true])
  }

  /// Setzt das Passwort der laufenden Sitzung neu und prüft es mit einem authentifizierten
  /// Roundtrip. Endpoint/Benutzer werden — falls noch nicht im Speicher — aus dem Keychain
  /// wiederhergestellt. Wirft AUTH bei falschem Passwort (post() ⇒ 401/403). Die Persistenz
  /// des neuen Secrets im Keychain übernimmt die JS-Schicht (AccountSetupService).
  func updatePassword(email: String, newPassword: String) async throws -> String {
    if ewsUrl == nil { _ = try restoreSession() }
    guard let user = currentUsername(), ewsUrl != nil else {
      throw NexusError.transport("Kein Konto geladen — bitte neu anmelden.")
    }
    locked {
      _password = newPassword
      _basicAuthHeader = Self.basicAuth(user: user, password: newPassword)
    }
    _ = try await post(EwsSoap.findFolders())
    return try Self.json(["verified": true])
  }

  func searchServer(accountId: String, query: String) async throws -> String {
    // EAS-Konten: Server-Suche liefert LongIds, die nicht zu den lokal gesyncten ServerIds
    // passen (Öffnen aus Treffer nicht eindeutig). Daher hier leer — die lokale FTS5-Suche
    // (SqlMailStore.searchLocal) deckt die Offline-Suche bereits ab.
    if useEas(accountId) { return try Self.json([[String: Any]]()) }
    let xml = try await post(EwsSoap.findItem(folderId: "inbox", query: query))
    let hits = EwsSoap.extractItemIds(xml).enumerated().map { (i, id) -> [String: Any] in
      ["messageId": id, "rank": Double(1000 - i), "source": "server"]
    }
    return try Self.json(hits)
  }

  // MARK: Hintergrund-Sync (nativer Cold-Start ohne JS-Kontext)

  /// Stellt EWS-URL + Credentials aus dem Keychain wieder her (Hintergrund-Task startet ohne
  /// laufenden JS-Kontext, der die Session sonst im Speicher hält). Liefert die accountId.
  @discardableResult
  func restoreSession() throws -> String? {
    guard let account = try NexusSecureStore.get("nexus:current-account") else { return nil }
    guard let metaStr = try NexusSecureStore.get("nexus:account:\(account)"),
      let meta = Self.jsonObject(metaStr) as? [String: Any],
      let ews = meta["ewsUrl"] as? String, let url = URL(string: ews),
      let secret = try NexusSecureStore.get("nexus:secret:\(account)")
    else { return nil }
    let user = meta["username"] as? String ?? account
    let domain = meta["domain"] as? String
    let effectiveUser =
      (domain != nil && !user.contains("\\") && !user.contains("@")) ? "\(domain!)\\\(user)" : user
    preferEwsSession = (meta["preferEws"] as? Bool) ?? false
    ewsUrl = url
    setCredentials(
      username: effectiveUser, password: secret,
      header: Self.basicAuth(user: effectiveUser, password: secret))
    return account
  }

  /// Synchronisiert den Posteingang nativ in die verschlüsselte DB. Liefert die Anzahl
  /// gespeicherter Nachrichten. Für den Hintergrund-Task (siehe NexusBackgroundSync).
  @discardableResult
  func syncInboxNative() async throws -> Int {
    guard let account = try restoreSession() else { return 0 }
    let json = try await syncMessages(accountId: account, folderId: "inbox", syncKey: nil)
    guard let delta = Self.jsonObject(json) as? [String: Any],
      let created = delta["created"] as? [[String: Any]]
    else { return 0 }
    for msg in created {
      try NexusDatabase.shared.upsertMessage(msg)
    }
    return created.count
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

  // MARK: EAS (ActiveSync) — HTTP über dieselbe gepinnte URLSession

  /// POSTet einen WBXML-Body an den EAS-Endpunkt. Reicht Command/User/DeviceId/DeviceType als
  /// Query-Parameter und MS-ASProtocolVersion/X-MS-PolicyKey als Header. Nutzt `self.session`
  /// (gleiche TLS/Pinning/Auth-Challenge wie EWS). Auth-Header (Basic) wird preemptiv gesetzt;
  /// NTLM-only-Server werden über die Challenge abgewickelt.
  func easPost(
    _ url: URL, command: String, deviceId: String, deviceType: String, user: String,
    protocolVersion: String, policyKey: String?, body: Data
  ) async throws -> (Data, HTTPURLResponse) {
    var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
    comps?.queryItems = [
      URLQueryItem(name: "Cmd", value: command),
      URLQueryItem(name: "User", value: user),
      URLQueryItem(name: "DeviceId", value: deviceId),
      URLQueryItem(name: "DeviceType", value: deviceType),
    ]
    guard let full = comps?.url else { throw NexusError.transport("EAS-URL ungültig") }
    var req = URLRequest(url: full)
    req.httpMethod = "POST"
    req.setValue("application/vnd.ms-sync.wbxml", forHTTPHeaderField: "Content-Type")
    req.setValue(protocolVersion, forHTTPHeaderField: "MS-ASProtocolVersion")
    if let auth = basicAuthHeader { req.setValue(auth, forHTTPHeaderField: "Authorization") }
    if let pk = policyKey, pk != "0" { req.setValue(pk, forHTTPHeaderField: "X-MS-PolicyKey") }
    req.httpBody = body
    let (data, response) = try await session.data(for: req)
    guard let http = response as? HTTPURLResponse else {
      throw NexusError.transport("EAS: keine HTTP-Antwort")
    }
    return (data, http)
  }

  /// OPTIONS-Anfrage zur EAS-Versions-/Command-Ermittlung (liefert die Antwort-Header).
  func easOptions(_ url: URL) async throws -> HTTPURLResponse {
    var req = URLRequest(url: url)
    req.httpMethod = "OPTIONS"
    req.timeoutInterval = 15
    if let auth = basicAuthHeader { req.setValue(auth, forHTTPHeaderField: "Authorization") }
    let (_, response) = try await session.data(for: req)
    guard let http = response as? HTTPURLResponse else {
      throw NexusError.transport("EAS: keine HTTP-Antwort (OPTIONS)")
    }
    return http
  }

  /// Standard-EAS-URL aus einem EWS-Host ableiten (`https://<host>/Microsoft-Server-ActiveSync`).
  static func defaultEasUrl(forEwsHost host: String?) -> String {
    guard let host = host, !host.isEmpty else { return "" }
    return "https://\(host)/Microsoft-Server-ActiveSync"
  }

  /// Diagnose-Einstieg (dark): OPTIONS → Provision → FolderSync „0" gegen den EAS-Endpunkt.
  /// `easUrl` leer ⇒ Standardpfad aus dem aktuellen EWS-Host. Nutzt die aktuelle Sitzung/Creds.
  func easVerify(accountId: String, easUrl: String) async throws -> String {
    let urlStr = easUrl.isEmpty ? Self.defaultEasUrl(forEwsHost: ewsUrl?.host) : easUrl
    guard let url = URL(string: urlStr) else { throw NexusError.transport("EAS-URL ungültig") }
    let user = currentUsername() ?? accountId
    return try await EasClient.shared.verify(accountId: accountId, easUrl: url, user: user)
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
    let attachments = item.attachments.map { (a) -> [String: Any] in
      ["id": a.id, "name": a.name, "contentType": a.contentType, "sizeBytes": a.size, "isInline": a.isInline]
    }
    // Empfänger (To/Cc) ins Domänenmodell überführen — für „Allen antworten"/Weiterleiten.
    let recipients = item.recipients.compactMap { (r) -> [String: Any]? in
      guard let addr = r["address"], !addr.isEmpty else { return nil }
      let name = r["name"] ?? ""
      let address: [String: Any] = name.isEmpty ? ["address": addr] : ["address": addr, "displayName": name]
      return ["kind": r["kind"] ?? "to", "address": address]
    }
    return [
      "id": item.id, "accountId": accountId, "folderId": folderId,
      "subject": item.subject,
      "from": ["address": item.fromAddress, "displayName": item.fromName],
      "recipients": recipients, "receivedAt": item.receivedAt, "importance": "normal",
      "flags": item.isRead ? ["read"] : [], "categories": [],
      "hasAttachments": item.hasAttachments || !attachments.isEmpty,
      "attachments": attachments, "preview": item.preview,
      "body": ["type": item.bodyHtml ? "html" : "text", "content": item.body.isEmpty ? item.preview : item.body],
    ]
  }

  private static let defaultCapabilities: [String: Any] = [
    "ews": true, "activeSync": false, "directPush": false,
    "publicFolders": true, "delegation": true, "serverSearch": true,
  ]

  /// Serialisiert über `NexusJSON` (REINES Obj-C @try/@catch). `JSONSerialization` wirft bei
  /// ungültigen Werten (NaN/Infinity, nicht serialisierbarer Typ) eine NSException — die über
  /// einen Swift-Closure-Guard NICHT zuverlässig fangbar ist (→ abort). Im reinen Obj-C-Frame
  /// wird sie sicher gefangen; hier kommt dann `nil` an → sauberer Swift-Fehler statt Crash.
  private static func json(_ value: Any) throws -> String {
    guard let out = NexusJSON.string(from: value) else {
      throw NexusError.transport("JSON-Serialisierung fehlgeschlagen (ungültiger Wert)")
    }
    return out
  }

  /// Parst einen JSON-String absturzsicher über `NexusJSON` (reines Obj-C @try/@catch).
  /// Bei jedem Fehler `nil`. Aufrufer casten das Ergebnis selbst.
  private static func jsonObject(_ string: String) -> Any? {
    NexusJSON.object(from: string)
  }
}
