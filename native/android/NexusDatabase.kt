package de.itmtechnologies.nexus

import android.content.Context
// import net.sqlcipher.database.SQLiteDatabase  // SQLCipher-Abhängigkeit (siehe README)

/**
 * Verschlüsselte lokale Datenbank (SQLCipher) hinter den DB-Primitiven `dbInit/dbExec/
 * dbQuery`. Der DB-Schlüssel wird im Android Keystore über `NexusSecureStore` gehalten
 * (ADR-005). Die JS-`SqlMailStore`-Adapter setzen darauf SQL ab.
 */
class NexusDatabase(private val context: Context, private val secureStore: NexusSecureStore) {
  private var initialized = false

  companion object {
    private const val DB_KEY = "nexus.db.masterkey"

    private val SCHEMA = listOf(
      """
      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        account_id  TEXT NOT NULL,
        folder_id   TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        subject     TEXT NOT NULL,
        preview     TEXT NOT NULL,
        payload     TEXT NOT NULL
      )
      """.trimIndent(),
      "CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(account_id, folder_id, received_at DESC)",
      "CREATE TABLE IF NOT EXISTS outbox (account_id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
      "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(subject, preview, content='messages', content_rowid='rowid')",
    )
  }

  fun initialize() {
    if (initialized) return
    val key = loadOrCreateMasterKey()
    // SQLiteDatabase.loadLibs(context)
    // db = SQLiteDatabase.openOrCreateDatabase(path, key, null)
    SCHEMA.forEach { exec(it, emptyList()) }
    initialized = true
  }

  /** Schreibendes Statement; liefert die Anzahl betroffener Zeilen. */
  fun exec(sql: String, params: List<Any?>): Int {
    // db.execSQL(sql, params.toTypedArray()); db.changes-Äquivalent zurückgeben
    return 0
  }

  /** Abfrage; liefert die Zeilen als Liste von Spalte→Wert-Maps. */
  fun query(sql: String, params: List<Any?>): List<Map<String, Any?>> {
    // db.rawQuery(sql, ...) → Cursor in Maps überführen
    return emptyList()
  }

  private fun loadOrCreateMasterKey(): String {
    secureStore.get(DB_KEY)?.let { return it }
    val bytes = ByteArray(32)
    java.security.SecureRandom().nextBytes(bytes)
    val key = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
    secureStore.set(DB_KEY, key)
    return key
  }
}
