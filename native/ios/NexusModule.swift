import Foundation
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
      do { resolve(try await NexusTransport.shared.syncMessages(accountId: accountId, folderId: folderId, syncKey: syncKey)) }
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
      do { resolve(try await NexusTransport.shared.syncFolders(accountId: accountId, syncKey: syncKey)) }
      catch { reject("transport_folders", "\(error)", error) }
    }
  }

  @objc(transportSyncCalendar:syncKey:resolver:rejecter:)
  func transportSyncCalendar(_ accountId: String, syncKey: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.syncCalendar(accountId: accountId, syncKey: syncKey)) }
      catch { reject("transport_calendar", "\(error)", error) }
    }
  }

  @objc(transportSyncContacts:syncKey:resolver:rejecter:)
  func transportSyncContacts(_ accountId: String, syncKey: String?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do { resolve(try await NexusTransport.shared.syncContacts(accountId: accountId, syncKey: syncKey)) }
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
}
