import Foundation
import SQLCipher

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/// Verschlüsselte lokale Datenbank (SQLCipher, AES-256 at-rest) hinter den DB-Primitiven
/// `dbInit/dbExec/dbQuery`. Der DB-Schlüssel wird im Keychain (Secure-Enclave-gebunden,
/// siehe `NexusSecureStore`) gehalten — ADR-005. Die JS-`SqlMailStore`-Adapter setzen
/// darauf SQL ab.
final class NexusDatabase {
  static let shared = NexusDatabase()

  private var db: OpaquePointer?
  private var isOpen = false

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

  /// Öffnet/erstellt die verschlüsselte DB, setzt den Schlüssel und legt das Schema an.
  func initialize() throws {
    guard !isOpen else { return }
    let key = try Self.loadOrCreateMasterKey()

    let dir = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let path = dir.appendingPathComponent("nexus.db").path

    guard sqlite3_open(path, &db) == SQLITE_OK else {
      throw NexusError.database("DB öffnen fehlgeschlagen")
    }
    // SQLCipher-Verschlüsselung aktivieren.
    let keyBytes = Array(key.utf8)
    guard sqlite3_key(db, keyBytes, Int32(keyBytes.count)) == SQLITE_OK else {
      throw NexusError.database("DB-Schlüssel setzen fehlgeschlagen")
    }
    // Smoke-Test, dass der Schlüssel korrekt ist.
    guard sqlite3_exec(db, "SELECT count(*) FROM sqlite_master;", nil, nil, nil) == SQLITE_OK else {
      throw NexusError.database("DB-Schlüssel ungültig")
    }

    try splitStatements(Self.schema).forEach { try exec($0, params: []) }
    isOpen = true
  }

  /// Schreibendes Statement; liefert die Anzahl betroffener Zeilen.
  @discardableResult
  func exec(_ sql: String, params: [Any?]) throws -> Int {
    let stmt = try prepare(sql, params: params)
    defer { sqlite3_finalize(stmt) }
    let rc = sqlite3_step(stmt)
    guard rc == SQLITE_DONE || rc == SQLITE_ROW else {
      throw NexusError.database("exec: \(lastError())")
    }
    return Int(sqlite3_changes(db))
  }

  /// Abfrage; liefert die Zeilen als [Spalte: Wert].
  func query(_ sql: String, params: [Any?]) throws -> [[String: Any]] {
    let stmt = try prepare(sql, params: params)
    defer { sqlite3_finalize(stmt) }
    let columns = Int(sqlite3_column_count(stmt))
    var rows: [[String: Any]] = []
    while sqlite3_step(stmt) == SQLITE_ROW {
      var row: [String: Any] = [:]
      for i in 0..<columns {
        let name = String(cString: sqlite3_column_name(stmt, Int32(i)))
        switch sqlite3_column_type(stmt, Int32(i)) {
        case SQLITE_INTEGER:
          row[name] = Int(sqlite3_column_int64(stmt, Int32(i)))
        case SQLITE_FLOAT:
          row[name] = sqlite3_column_double(stmt, Int32(i))
        case SQLITE_NULL:
          row[name] = NSNull()
        default:
          if let text = sqlite3_column_text(stmt, Int32(i)) {
            row[name] = String(cString: text)
          } else {
            row[name] = NSNull()
          }
        }
      }
      rows.append(row)
    }
    return rows
  }

  private func prepare(_ sql: String, params: [Any?]) throws -> OpaquePointer? {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
      throw NexusError.database("prepare: \(lastError())")
    }
    for (index, param) in params.enumerated() {
      let pos = Int32(index + 1)
      switch param {
      case let s as String:
        sqlite3_bind_text(stmt, pos, s, -1, SQLITE_TRANSIENT)
      case let n as NSNumber:
        if CFNumberIsFloatType(n) {
          sqlite3_bind_double(stmt, pos, n.doubleValue)
        } else {
          sqlite3_bind_int64(stmt, pos, n.int64Value)
        }
      case nil, is NSNull:
        sqlite3_bind_null(stmt, pos)
      default:
        sqlite3_bind_text(stmt, pos, "\(param!)", -1, SQLITE_TRANSIENT)
      }
    }
    return stmt
  }

  private func lastError() -> String {
    guard let msg = sqlite3_errmsg(db) else { return "unbekannt" }
    return String(cString: msg)
  }

  /// Zerlegt das Schema in Einzel-Statements (FTS5-VIRTUAL-TABLE inklusive).
  private func splitStatements(_ sql: String) -> [String] {
    sql.components(separatedBy: ";")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }

  /// DB-Master-Key aus dem Keychain laden oder neu erzeugen (ADR-005).
  private static func loadOrCreateMasterKey() throws -> String {
    if let existing = try NexusSecureStore.get("nexus.db.masterkey") {
      return existing
    }
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
      throw NexusError.database("Schlüsselerzeugung fehlgeschlagen")
    }
    let key = Data(bytes).base64EncodedString()
    try NexusSecureStore.set("nexus.db.masterkey", value: key)
    return key
  }
}
