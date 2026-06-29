import Foundation
import LocalAuthentication
import React

/// React-Native-Bridge des nativen NEXUS-Kernmoduls. Exportiert Secure-Storage, die
/// verschlüsselte DB und den Exchange-Transport an JS (siehe apps/nexus-mobile/src/native).
/// Methoden sind Promise-basiert (resolve/reject).
@objc(NexusNative)
final class NexusModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  /// Führt einen synchronen Methodenrumpf aus und wandelt eine etwaige Objective-C-NSException
  /// in ein reject() um. Swift kann NSExceptions nicht fangen; erreichen sie die RN-Bridge,
  /// stürzt deren NSException→JSError-Konverter ab (SIGSEGV). Dieser Guard verhindert das.
  private func guarded(_ code: String, _ reject: RCTPromiseRejectBlock, _ body: () -> Void) {
    if let exception = NexusExceptionGuard.run(body) {
      reject(code, "NSException: \(exception.reason ?? exception.name.rawValue)", nil)
    }
  }

  /// Normalisiert einen Bridge-String: leer ⇒ `nil`. JS übergibt für „kein syncKey" bewusst "" und
  /// NICHT null (JS-null würde als `NSString *`-Parameter zu `NSNull` und die RN-Bridge stürzte bei
  /// `-[NSNull length]` ab). Nativ ist "" damit gleichbedeutend mit „Erst-Sync" (= nil).
  private static func nilIfEmpty(_ s: String?) -> String? {
    guard let s, !s.isEmpty else { return nil }
    return s
  }

  // MARK: Secure-Storage

  @objc(secureSet:value:resolver:rejecter:)
  func secureSet(_ key: String, value: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("secure_set", reject) {
      do { try NexusSecureStore.set(key, value: value); resolve(nil) }
      catch { reject("secure_set", "\(error)", error) }
    }
  }

  @objc(secureGet:resolver:rejecter:)
  func secureGet(_ key: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("secure_get", reject) {
      do { resolve(try NexusSecureStore.get(key)) }
      catch { reject("secure_get", "\(error)", error) }
    }
  }

  @objc(secureDelete:resolver:rejecter:)
  func secureDelete(_ key: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("secure_delete", reject) {
      do { try NexusSecureStore.delete(key); resolve(nil) }
      catch { reject("secure_delete", "\(error)", error) }
    }
  }

  @objc(secureWipe:rejecter:)
  func secureWipe(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("secure_wipe", reject) {
      do { try NexusSecureStore.wipe(); resolve(nil) }
      catch { reject("secure_wipe", "\(error)", error) }
    }
  }

  // MARK: Verschlüsselte DB

  @objc(dbInit:rejecter:)
  func dbInit(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("db_init", reject) {
      do { try NexusDatabase.shared.initialize(); resolve(nil) }
      catch { reject("db_init", "\(error)", error) }
    }
  }

  @objc(dbExec:params:resolver:rejecter:)
  func dbExec(_ sql: String, params: [Any], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("db_exec", reject) {
      do { resolve(try NexusDatabase.shared.exec(sql, params: params)) }
      catch { reject("db_exec", "\(error)", error) }
    }
  }

  @objc(dbQuery:params:resolver:rejecter:)
  func dbQuery(_ sql: String, params: [Any], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("db_query", reject) {
      do { resolve(try NexusDatabase.shared.query(sql, params: params)) }
      catch { reject("db_query", "\(error)", error) }
    }
  }

  @objc(dbExecBatch:resolver:rejecter:)
  func dbExecBatch(_ stmtsJson: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("db_exec_batch", reject) {
      do { try NexusDatabase.shared.execBatch(json: stmtsJson); resolve(nil) }
      catch { reject("db_exec_batch", "\(error)", error) }
    }
  }

  /// Leert die lokale DB (Krypto-Schlüssel/Zugangsdaten bleiben) — „Lokalen Cache leeren".
  /// Beim nächsten `dbInit()` wird leer neu aufgebaut, der Sync füllt die Daten erneut.
  @objc(dbReset:rejecter:)
  func dbReset(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("db_reset", reject) {
      do { try NexusDatabase.shared.reset(); resolve(nil) }
      catch { reject("db_reset", "\(error)", error) }
    }
  }

  // MARK: Transport (async → Promise)

  @objc(transportDiscover:credentialsJson:resolver:rejecter:)
  func transportDiscover(_ email: String, credentialsJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.discover(email: email, credentialsJson: credentialsJson)) }
      catch { reject("transport_discover", "\(error)", error) }
    }
  }

  @objc(transportVerify:resolver:rejecter:)
  func transportVerify(_ email: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.verifyCredentials(email: email)) }
      catch { reject("transport_verify", "\(error)", error) }
    }
  }

  @objc(transportUpdatePassword:password:resolver:rejecter:)
  func transportUpdatePassword(_ email: String, password: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.updatePassword(email: email, newPassword: password)) }
      catch { reject("transport_update_password", "\(error)", error) }
    }
  }

  @objc(transportRestore:rejecter:)
  func transportRestore(_ resolve: RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Stellt Endpoint + Auth aus dem Keychain wieder her (kein Netz). Liefert die accountId
    // oder null. Bewusst OHNE Anmeldeprüfung — Offline-First: Sync verifiziert später.
    guarded("transport_restore", reject) {
      do { resolve(try NexusTransport.shared.restoreSession()) }
      catch { reject("transport_restore", "\(error)", error) }
    }
  }

  @objc(transportSyncMessages:folderId:syncKey:resolver:rejecter:)
  func transportSyncMessages(_ accountId: String, folderId: String, syncKey: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.syncMessages(accountId: accountId, folderId: folderId, syncKey: Self.nilIfEmpty(syncKey))) }
      catch { reject("transport_sync", "\(error)", error) }
    }
  }

  @objc(transportApplyOperation:resolver:rejecter:)
  func transportApplyOperation(_ operationJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { try await NexusTransport.shared.applyOperation(operationJson: operationJson); resolve(nil) }
      catch { reject("transport_apply", "\(error)", error) }
    }
  }

  @objc(transportSendMessage:messageJson:resolver:rejecter:)
  func transportSendMessage(_ accountId: String, messageJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.sendMessage(accountId: accountId, messageJson: messageJson)) }
      catch { reject("transport_send", "\(error)", error) }
    }
  }

  @objc(transportSaveDraft:messageJson:resolver:rejecter:)
  func transportSaveDraft(_ accountId: String, messageJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.saveDraft(accountId: accountId, messageJson: messageJson)) }
      catch { reject("transport_savedraft", "\(error)", error) }
    }
  }

  @objc(transportCreateContact:contactJson:resolver:rejecter:)
  func transportCreateContact(_ accountId: String, contactJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.createContact(accountId: accountId, contactJson: contactJson)) }
      catch { reject("transport_contact_create", "\(error)", error) }
    }
  }

  @objc(transportUpdateContact:contactJson:resolver:rejecter:)
  func transportUpdateContact(_ accountId: String, contactJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.updateContact(accountId: accountId, contactJson: contactJson)) }
      catch { reject("transport_contact_update", "\(error)", error) }
    }
  }

  @objc(transportDeleteContact:contactId:resolver:rejecter:)
  func transportDeleteContact(_ accountId: String, contactId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do {
        try await NexusTransport.shared.deleteContact(accountId: accountId, contactId: contactId)
        resolve(nil)
      } catch { reject("transport_contact_delete", "\(error)", error) }
    }
  }

  @objc(transportCreateEvent:eventJson:resolver:rejecter:)
  func transportCreateEvent(_ accountId: String, eventJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.createEvent(accountId: accountId, eventJson: eventJson)) }
      catch { reject("transport_event_create", "\(error)", error) }
    }
  }

  @objc(transportUpdateEvent:eventJson:resolver:rejecter:)
  func transportUpdateEvent(_ accountId: String, eventJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.updateEvent(accountId: accountId, eventJson: eventJson)) }
      catch { reject("transport_event_update", "\(error)", error) }
    }
  }

  @objc(transportDeleteEvent:eventId:isMeeting:resolver:rejecter:)
  func transportDeleteEvent(_ accountId: String, eventId: String, isMeeting: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do {
        try await NexusTransport.shared.deleteEvent(accountId: accountId, eventId: eventId, isMeeting: isMeeting)
        resolve(nil)
      } catch { reject("transport_event_delete", "\(error)", error) }
    }
  }

  @objc(transportRespondEvent:eventId:changeKey:responseType:resolver:rejecter:)
  func transportRespondEvent(_ accountId: String, eventId: String, changeKey: String, responseType: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do {
        try await NexusTransport.shared.respondEvent(accountId: accountId, eventId: eventId, changeKey: changeKey, responseType: responseType)
        resolve(nil)
      } catch { reject("transport_event_respond", "\(error)", error) }
    }
  }

  /// Öffnet den System-Dateiauswähler und liefert die gewählte Datei (Base64) zurück.
  @objc(pickAttachment:rejecter:)
  func pickAttachment(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusAttachmentPicker.pick()) }
      catch { reject("attachment_pick", "\(error)", error) }
    }
  }

  @objc(transportSearchServer:query:resolver:rejecter:)
  func transportSearchServer(_ accountId: String, query: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.searchServer(accountId: accountId, query: query)) }
      catch { reject("transport_search", "\(error)", error) }
    }
  }

  @objc(transportLoadAccount:resolver:rejecter:)
  func transportLoadAccount(_ accountId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.loadAccount(accountId: accountId)) }
      catch { reject("transport_account", "\(error)", error) }
    }
  }

  @objc(transportSyncFolders:syncKey:resolver:rejecter:)
  func transportSyncFolders(_ accountId: String, syncKey: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.syncFolders(accountId: accountId, syncKey: Self.nilIfEmpty(syncKey))) }
      catch { reject("transport_folders", "\(error)", error) }
    }
  }

  @objc(transportSyncCalendar:syncKey:resolver:rejecter:)
  func transportSyncCalendar(_ accountId: String, syncKey: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.syncCalendar(accountId: accountId, syncKey: Self.nilIfEmpty(syncKey))) }
      catch { reject("transport_calendar", "\(error)", error) }
    }
  }

  @objc(transportSyncContacts:syncKey:resolver:rejecter:)
  func transportSyncContacts(_ accountId: String, syncKey: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.syncContacts(accountId: accountId, syncKey: Self.nilIfEmpty(syncKey))) }
      catch { reject("transport_contacts", "\(error)", error) }
    }
  }

  @objc(transportGetMessage:messageId:resolver:rejecter:)
  func transportGetMessage(_ accountId: String, messageId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.getMessage(accountId: accountId, messageId: messageId)) }
      catch { reject("transport_getmessage", "\(error)", error) }
    }
  }

  /// Diagnose (dark): EAS-Verbindung prüfen — OPTIONS → Provision → FolderSync „0".
  /// `easUrl` leer ⇒ Standardpfad aus dem aktuellen EWS-Host. Liefert JSON mit Version/Status.
  @objc(transportEasProbe:easUrl:resolver:rejecter:)
  func transportEasProbe(_ accountId: String, easUrl: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.easVerify(accountId: accountId, easUrl: easUrl)) }
      catch { reject("transport_eas_probe", "\(error)", error) }
    }
  }

  /// Zuletzt genutztes Mail-Protokoll des Kontos („eas" | „ews" | „unbekannt") für die UI.
  @objc(transportActiveProtocol:resolver:rejecter:)
  func transportActiveProtocol(_ accountId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.activeProtocol(accountId: accountId)) }
      catch { reject("transport_protocol", "\(error)", error) }
    }
  }

  /// TOFU: Server-Zertifikat lesen (Fingerprint/Subject), ohne etwas zu vertrauen.
  @objc(transportProbeCertificate:resolver:rejecter:)
  func transportProbeCertificate(_ host: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.probeCertificate(host: host)) }
      catch { reject("transport_cert_probe", "\(error)", error) }
    }
  }

  /// TOFU: vom Nutzer bestätigten SPKI-Pin für den Host speichern + sofort aktivieren.
  @objc(transportTrustCertificate:spki:resolver:rejecter:)
  func transportTrustCertificate(_ host: String, spki: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do {
        try await NexusTransport.shared.trustCertificate(host: host, spkiSha256: spki)
        resolve(nil)
      } catch { reject("transport_cert_trust", "\(error)", error) }
    }
  }

  @objc(transportConfigurePinning:resolver:rejecter:)
  func transportConfigurePinning(_ pinsJson: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("transport_pinning", reject) {
      NexusTransport.shared.configurePinning(pinsJson)
      resolve(nil)
    }
  }

  @objc(transportPing:folderIdsJson:timeoutSec:resolver:rejecter:)
  func transportPing(_ accountId: String, folderIdsJson: String, timeoutSec: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.ping(accountId: accountId, folderIdsJson: folderIdsJson, timeoutSec: timeoutSec.doubleValue)) }
      catch { reject("transport_ping", "\(error)", error) }
    }
  }

  @objc(transportScheduleBackgroundSync:rejecter:)
  func transportScheduleBackgroundSync(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("transport_bgsync", reject) {
      NexusBackgroundSync.schedule()
      resolve(nil)
    }
  }

  @objc(transportGetAttachment:attachmentId:resolver:rejecter:)
  func transportGetAttachment(_ accountId: String, attachmentId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.getAttachment(accountId: accountId, attachmentId: attachmentId)) }
      catch { reject("transport_attachment", "\(error)", error) }
    }
  }

  @objc(transportPresentAttachment:attachmentId:resolver:rejecter:)
  func transportPresentAttachment(_ accountId: String, attachmentId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { try await NexusTransport.shared.presentAttachment(accountId: accountId, attachmentId: attachmentId); resolve(nil) }
      catch { reject("transport_present_attachment", "\(error)", error) }
    }
  }

  // MARK: Freigegebene Postfächer (Delegation)

  @objc(transportVerifySharedMailbox:owner:resolver:rejecter:)
  func transportVerifySharedMailbox(_ accountId: String, owner: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.verifySharedMailbox(owner: owner)) }
      catch { reject("shared_verify", "\(error)", error) }
    }
  }

  @objc(transportSyncSharedInbox:owner:resolver:rejecter:)
  func transportSyncSharedInbox(_ accountId: String, owner: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.syncSharedInbox(owner: owner)) }
      catch { reject("shared_inbox", "\(error)", error) }
    }
  }

  @objc(transportSyncSharedCalendar:owner:resolver:rejecter:)
  func transportSyncSharedCalendar(_ accountId: String, owner: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.syncSharedCalendar(owner: owner)) }
      catch { reject("shared_calendar", "\(error)", error) }
    }
  }

  // MARK: Netzwerkstatus (für „Nur über WLAN")

  /// Aktueller Verbindungstyp: "wifi" | "cellular" | "none".
  @objc(networkStatus:rejecter:)
  func networkStatus(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("network_status", reject) {
      resolve(NexusNetwork.shared.status())
    }
  }

  // MARK: Crash-Diagnose (On-Device, kein Cloud)

  /// Letzter nativer Crash-Bericht (NSException-`reason` bzw. Signal-Backtrace) oder `nil`.
  /// Wird beim App-Start ausgelesen und dem Nutzer angezeigt — so wird der bislang im
  /// `.ips` unsichtbare Grund endlich sichtbar.
  @objc(crashLastReport:rejecter:)
  func crashLastReport(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("crash_last", reject) {
      resolve(NexusCrashReporter.lastReport())
    }
  }

  /// Löscht den gespeicherten Crash-Bericht (nach dem Anzeigen).
  @objc(crashClearReport:rejecter:)
  func crashClearReport(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("crash_clear", reject) {
      NexusCrashReporter.clearReport()
      resolve(nil)
    }
  }

  // MARK: App-Sperre (Biometrie / Face ID / Touch ID)

  /// Liefert, ob Geräte-Biometrie verfügbar ist und welcher Typ (faceID/touchID/none).
  @objc(biometricAvailable:rejecter:)
  func biometricAvailable(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guarded("biometric_available", reject) {
      let context = LAContext()
      var error: NSError?
      let canBio = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
      let type: String
      switch context.biometryType {
      case .faceID: type = "faceID"
      case .touchID: type = "touchID"
      default: type = "none"
      }
      resolve(["available": canBio, "type": canBio ? type : "none"])
    }
  }

  /// Fordert eine biometrische Entsperrung an (mit Geräte-Code als Fallback). Resolved `true`
  /// bei Erfolg, rejectet bei Abbruch/Fehlschlag/fehlender Hardware.
  @objc(biometricAuthenticate:resolver:rejecter:)
  func biometricAuthenticate(_ reason: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let context = LAContext()
    context.localizedFallbackTitle = "Code eingeben"
    var error: NSError?
    // deviceOwnerAuthentication = Biometrie ODER Geräte-Code (robuster als nur Biometrie).
    guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
      reject("biometric_unavailable", error?.localizedDescription ?? "Sperre nicht verfügbar", error)
      return
    }
    context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, evalError in
      if success {
        resolve(true)
      } else {
        reject("biometric_failed", evalError?.localizedDescription ?? "Authentifizierung fehlgeschlagen", evalError)
      }
    }
  }
}
