package de.itmtechnologies.nexus

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.util.concurrent.Executors

/**
 * React-Native-Bridge des nativen NEXUS-Kernmoduls (`NexusNative`). Exportiert
 * Secure-Storage, die verschlüsselte DB und den Exchange-Transport an JS. Blockierende
 * Arbeit läuft auf einem Hintergrund-Executor; Auflösung Promise-basiert.
 */
class NexusModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val io = Executors.newSingleThreadExecutor()
  private val secureStore = NexusSecureStore(reactContext.applicationContext)
  private val database = NexusDatabase(reactContext.applicationContext, secureStore)
  private val transport = NexusTransport()

  override fun getName(): String = "NexusNative"

  private fun run(promise: Promise, code: String, block: () -> Any?) {
    io.execute {
      try {
        promise.resolve(block())
      } catch (e: Throwable) {
        promise.reject(code, e.message, e)
      }
    }
  }

  // — Secure-Storage —

  @ReactMethod
  fun secureSet(key: String, value: String, promise: Promise) =
    run(promise, "secure_set") { secureStore.set(key, value); null }

  @ReactMethod
  fun secureGet(key: String, promise: Promise) =
    run(promise, "secure_get") { secureStore.get(key) }

  @ReactMethod
  fun secureDelete(key: String, promise: Promise) =
    run(promise, "secure_delete") { secureStore.delete(key); null }

  @ReactMethod
  fun secureWipe(promise: Promise) =
    run(promise, "secure_wipe") { secureStore.wipe(); null }

  // — Verschlüsselte DB —

  @ReactMethod
  fun dbInit(promise: Promise) =
    run(promise, "db_init") { database.initialize(); null }

  @ReactMethod
  fun dbExec(sql: String, params: ReadableArray, promise: Promise) =
    run(promise, "db_exec") { database.exec(sql, params.toArrayList()) }

  @ReactMethod
  fun dbQuery(sql: String, params: ReadableArray, promise: Promise) =
    run(promise, "db_query") { Arguments.makeNativeArray(database.query(sql, params.toArrayList())) }

  // — Transport —

  @ReactMethod
  fun transportDiscover(email: String, credentialsJson: String, promise: Promise) =
    run(promise, "transport_discover") { transport.discover(email, credentialsJson) }

  @ReactMethod
  fun transportSyncMessages(accountId: String, folderId: String, syncKey: String?, promise: Promise) =
    run(promise, "transport_sync") { transport.syncMessages(accountId, folderId, syncKey) }

  @ReactMethod
  fun transportApplyOperation(operationJson: String, promise: Promise) =
    run(promise, "transport_apply") { transport.applyOperation(operationJson); null }

  @ReactMethod
  fun transportSendMessage(accountId: String, messageJson: String, promise: Promise) =
    run(promise, "transport_send") { transport.sendMessage(accountId, messageJson) }

  @ReactMethod
  fun transportSearchServer(accountId: String, query: String, promise: Promise) =
    run(promise, "transport_search") { transport.searchServer(accountId, query) }

  @ReactMethod
  fun transportLoadAccount(accountId: String, promise: Promise) =
    run(promise, "transport_account") { transport.loadAccount(accountId) }

  @ReactMethod
  fun transportSyncFolders(accountId: String, syncKey: String?, promise: Promise) =
    run(promise, "transport_folders") { transport.syncFolders(accountId, syncKey) }

  @ReactMethod
  fun transportSyncCalendar(accountId: String, syncKey: String?, promise: Promise) =
    run(promise, "transport_calendar") { transport.syncCalendar(accountId, syncKey) }

  @ReactMethod
  fun transportSyncContacts(accountId: String, syncKey: String?, promise: Promise) =
    run(promise, "transport_contacts") { transport.syncContacts(accountId, syncKey) }

  @ReactMethod
  fun transportGetMessage(accountId: String, messageId: String, promise: Promise) =
    run(promise, "transport_getmessage") { transport.getMessage(accountId, messageId) }
}
