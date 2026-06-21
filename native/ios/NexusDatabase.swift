import Foundation
// import SQLCipher  // via CocoaPods/SwiftPM einbinden (siehe README)

/// Verschlüsselte lokale Datenbank (SQLCipher) hinter den DB-Primitiven `dbInit/dbExec/
/// dbQuery`. Der DB-Schlüssel wird aus einem im Secure Enclave gebundenen Keychain-Eintrag
/// abgeleitet (ADR-005). Die JS-`SqlMailStore`-Adapter setzen darauf SQL ab.
///
/// Hinweis: Die SQLCipher-Aufrufe (`sqlite3_key`, `sqlite3_prepare_v2`, …) werden beim
/// Einbinden der SQLCipher-Abhängigkeit aktiviert; das Schema unten ist die Quelle der
/// Wahrheit für `messages`, `outbox` und den FTS5-Index.
final class NexusDatabase {
  static let shared = NexusDatabase()

  private var isOpen = false
  private let dbKeychainKey = "nexus.db.masterkey"

  private static let schema = """
  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL,
    folder_id   TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    subject     TEXT NOT NULL,
    preview     TEXT NOT NULL,
    payload     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_folder
    ON messages(account_id, folder_id, received_at DESC);

  CREATE TABLE IF NOT EXISTS outbox (
    account_id TEXT PRIMARY KEY,
    payload    TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(subject, preview, content='messages', content_rowid='rowid');
  """

  /// Öffnet/erstellt die verschlüsselte DB, leitet den Schlüssel ab und legt das Schema an.
  func initialize() throws {
    guard !isOpen else { return }
    let key = try Self.loadOrCreateMasterKey()
    // sqlite3_open_v2(path, &handle, ...)
    // sqlite3_key(handle, key, key.count)  // SQLCipher-Verschlüsselung aktivieren
    _ = key
    try exec(Self.schema, params: [])
    isOpen = true
  }

  /// Führt ein schreibendes Statement aus und liefert die Anzahl betroffener Zeilen.
  @discardableResult
  func exec(_ sql: String, params: [Any?]) throws -> Int {
    // sqlite3_prepare_v2 → bind(params) → sqlite3_step → sqlite3_changes
    _ = (sql, params)
    return 0
  }

  /// Führt eine Abfrage aus und liefert die Zeilen als [Spalte: Wert].
  func query(_ sql: String, params: [Any?]) throws -> [[String: Any]] {
    // sqlite3_prepare_v2 → bind(params) → Schleife sqlite3_step → Spalten lesen
    _ = (sql, params)
    return []
  }

  /// DB-Master-Key aus dem Keychain (Secure-Enclave-gebunden) laden oder erzeugen.
  private static func loadOrCreateMasterKey() throws -> Data {
    if let existing = try NexusSecureStore.get("nexus.db.masterkey") {
      return Data(base64Encoded: existing) ?? Data(existing.utf8)
    }
    var bytes = [UInt8](repeating: 0, count: 32)
    let result = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard result == errSecSuccess else { throw NexusError.database("Schlüsselerzeugung fehlgeschlagen") }
    let key = Data(bytes)
    try NexusSecureStore.set("nexus.db.masterkey", value: key.base64EncodedString())
    return key
  }
}
