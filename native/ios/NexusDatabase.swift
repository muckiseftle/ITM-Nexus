import Foundation
import SQLCipher

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

// `sqlite3_key` ist in sqlite3.h nur unter `SQLITE_HAS_CODEC` deklariert. Über die
// vorkompilierte CocoaPods-Module-Map von SQLCipher ist das Symbol für Swift nicht
// sichtbar („cannot find 'sqlite3_key' in scope"), obwohl der statisch gelinkte
// SQLCipher-Pod es exportiert. Wir binden das C-Symbol daher direkt an (ADR-005).
@_silgen_name("sqlite3_key")
private func nexus_sqlite3_key(
  _ db: OpaquePointer?, _ pKey: UnsafeRawPointer?, _ nKey: Int32
) -> Int32

/// Verschlüsselte lokale Datenbank (SQLCipher, AES-256 at-rest) hinter den DB-Primitiven
/// `dbInit/dbExec/dbQuery`. Der DB-Schlüssel wird im Keychain (Secure-Enclave-gebunden,
/// siehe `NexusSecureStore`) gehalten — ADR-005. Die JS-`SqlMailStore`-Adapter setzen
/// darauf SQL ab.
final class NexusDatabase {
  static let shared = NexusDatabase()

  private var db: OpaquePointer?
  private var isOpen = false
  /// Serialisiert ALLE DB-Zugriffe (JS-Bridge-Queue vs. nativer BGTask). Das SQLite-Handle und
  /// der Selbstheilungs-Reset (`db = nil`) dürfen nicht nebenläufig benutzt werden (Crash-Schutz).
  private let queue = DispatchQueue(label: "de.itm.nexus.db")

  private static let schema = """
  CREATE TABLE IF NOT EXISTS messages (
    id           TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL,
    folder_id    TEXT NOT NULL,
    received_at  INTEGER NOT NULL,
    subject      TEXT NOT NULL,
    preview      TEXT NOT NULL,
    from_name    TEXT,
    from_address TEXT,
    is_read      INTEGER NOT NULL DEFAULT 0,
    flagged      INTEGER NOT NULL DEFAULT 0,
    payload      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_folder
    ON messages(account_id, folder_id, received_at DESC);
  CREATE TABLE IF NOT EXISTS outbox (
    account_id TEXT PRIMARY KEY,
    payload    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS folders (
    id         TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id         TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    start_at   INTEGER NOT NULL,
    end_at     INTEGER NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_range ON events(account_id, start_at);
  CREATE TABLE IF NOT EXISTS contacts (
    id           TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email        TEXT,
    payload      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
  CREATE INDEX IF NOT EXISTS idx_folders_account ON folders(account_id);
  CREATE TABLE IF NOT EXISTS sync_cursors (
    key    TEXT PRIMARY KEY,
    cursor TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(subject, preview, content='messages', content_rowid='rowid');
  """

  /// Trigger + Rebuild zur Pflege des external-content-FTS5-Index. Separat (nicht über die
  /// `;`-Aufteilung des Schemas), weil CREATE TRIGGER interne Semikolons enthält — jeder
  /// String ist genau EIN Statement für `sqlite3_prepare_v2`.
  private static let ftsMaintenance: [String] = [
    "CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, subject, preview) VALUES (new.rowid, new.subject, new.preview); END",
    "CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN INSERT INTO messages_fts(messages_fts, rowid, subject, preview) VALUES('delete', old.rowid, old.subject, old.preview); END",
    "CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN INSERT INTO messages_fts(messages_fts, rowid, subject, preview) VALUES('delete', old.rowid, old.subject, old.preview); INSERT INTO messages_fts(rowid, subject, preview) VALUES (new.rowid, new.subject, new.preview); END",
    "INSERT INTO messages_fts(messages_fts) VALUES('rebuild')",
  ]

  /// Öffnet/erstellt die verschlüsselte DB, setzt den Schlüssel und legt das Schema an.
  func initialize() throws { try queue.sync { try _initialize() } }

  private func _initialize() throws {
    guard !isOpen else { return }
    let key = try Self.loadOrCreateMasterKey()

    let dir = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let path = dir.appendingPathComponent("nexus.db").path

    // Selbstheilung beim Start: Lässt sich die vorhandene DB nicht öffnen ODER ist sie öffenbar,
    // aber inhaltlich beschädigt (Schema/FTS-Aufbau wirft — z. B. nach einem früheren Daten-Race
    // mit zerstörten Seiten), wird die Datei EINMAL verworfen und komplett frisch aufgebaut.
    // Eine leere, funktionierende DB ist immer besser als ein Dauer-Absturz beim App-Start.
    do {
      try openAndBuildSchema(path: path, key: key)
    } catch {
      discardDatabaseFiles(at: path)
      guard openWithKey(path: path, key: key) else {
        throw NexusError.database("DB konnte nach Reset nicht geöffnet werden")
      }
      try buildSchema()
    }
    isOpen = true
  }

  /// Öffnet die DB unter `path` und legt Schema, additive Spalten und FTS-Pflege an. Wirft bei
  /// jedem Fehler (Öffnen ODER Aufbau), damit `_initialize` selbstheilend neu aufbauen kann.
  private func openAndBuildSchema(path: String, key: String) throws {
    guard openWithKey(path: path, key: key) else {
      throw NexusError.database("DB konnte nicht geöffnet werden")
    }
    try buildSchema()
  }

  /// Legt Schema + additive H7-Spalten + FTS5-Pflege auf der bereits geöffneten DB an.
  private func buildSchema() throws {
    try splitStatements(Self.schema).forEach { try _exec($0, params: []) }
    // Schlanke Listen-Spalten (H7) additiv nachrüsten — ältere DBs haben die `messages`-Tabelle
    // ohne diese Spalten. SQLite kennt kein „ADD COLUMN IF NOT EXISTS", daher `try?`: ein
    // „duplicate column"-Fehler bei bereits vorhandener Spalte wird bewusst ignoriert.
    for col in ["from_name TEXT", "from_address TEXT", "is_read INTEGER NOT NULL DEFAULT 0", "flagged INTEGER NOT NULL DEFAULT 0"] {
      try? _exec("ALTER TABLE messages ADD COLUMN \(col)", params: [])
    }
    // FTS5-Index per Trigger pflegen (external-content) + bestehende Zeilen einmalig einlesen.
    try Self.ftsMaintenance.forEach { try _exec($0, params: []) }
  }

  /// Schließt das Handle und entfernt die DB-Datei samt WAL/SHM/Journal (Selbstheilung/Reset).
  private func discardDatabaseFiles(at path: String) {
    if db != nil {
      sqlite3_close(db)
      db = nil
    }
    for suffix in ["", "-wal", "-shm", "-journal"] {
      try? FileManager.default.removeItem(atPath: path + suffix)
    }
  }

  /// Vollständiger Daten-Reset (Notfall/„Daten zurücksetzen"): schließt die DB und löscht die
  /// Datei. Beim nächsten `initialize()` wird leer neu aufgebaut. Thread-sicher über die Queue.
  func reset() throws {
    try queue.sync {
      let dir = try FileManager.default.url(
        for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      let path = dir.appendingPathComponent("nexus.db").path
      discardDatabaseFiles(at: path)
      isOpen = false
    }
  }

  /// Öffnet die DB unter `path` mit `key` und prüft den Schlüssel per Smoke-Test.
  /// Liefert `false` (und schließt das Handle) bei jedem Fehlschlag.
  private func openWithKey(path: String, key: String) -> Bool {
    guard sqlite3_open(path, &db) == SQLITE_OK else {
      if db != nil { sqlite3_close(db); db = nil }
      return false
    }
    let keyBytes = Array(key.utf8)
    guard nexus_sqlite3_key(db, keyBytes, Int32(keyBytes.count)) == SQLITE_OK,
      sqlite3_exec(db, "SELECT count(*) FROM sqlite_master;", nil, nil, nil) == SQLITE_OK
    else {
      sqlite3_close(db)
      db = nil
      return false
    }
    return true
  }

  /// Fügt/aktualisiert eine Nachricht aus einem Transport-Delta (nativer Hintergrund-Sync).
  /// Spiegelt das Upsert der JS-`SqlMailStore` (gleiches Schema/Konfliktverhalten).
  func upsertMessage(_ msg: [String: Any]) throws {
    let id = msg["id"] as? String ?? ""
    guard !id.isEmpty else { return }
    let account = msg["accountId"] as? String ?? ""
    let folder = msg["folderId"] as? String ?? "inbox"
    let received = (msg["receivedAt"] as? NSNumber)?.int64Value ?? 0
    let subject = msg["subject"] as? String ?? ""
    let preview = msg["preview"] as? String ?? ""
    // Schlanke Listen-Spalten (H7): Absender + Lese-/Flag-Status aus dem Delta ableiten,
    // damit `listFolder` ohne JSON-Parsing der vollen Payload auskommt.
    let from = msg["from"] as? [String: Any]
    let fromName = from?["displayName"] as? String
    let fromAddress = from?["address"] as? String
    let flags = (msg["flags"] as? [String]) ?? []
    let isRead = flags.contains("read") ? 1 : 0
    let flagged = flags.contains("flagged") ? 1 : 0
    // Serialisierung über NexusJSON (reines Obj-C @try/@catch) — JSONSerialization kann sonst
    // eine NSException werfen (NaN/ungültiger Typ), die über Swift-Frames nicht fangbar ist.
    let payload = NexusJSON.string(from: msg) ?? "{}"
    try queue.sync {
      try _exec(
        """
        INSERT INTO messages
          (id, account_id, folder_id, received_at, subject, preview,
           from_name, from_address, is_read, flagged, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          folder_id = excluded.folder_id, received_at = excluded.received_at,
          subject = excluded.subject, preview = excluded.preview,
          from_name = excluded.from_name, from_address = excluded.from_address,
          is_read = excluded.is_read, flagged = excluded.flagged, payload = excluded.payload
        """,
        params: [
          id, account, folder, received, subject, preview,
          fromName, fromAddress, isRead, flagged, payload,
        ])
    }
  }

  /// Schreibendes Statement; liefert die Anzahl betroffener Zeilen.
  @discardableResult
  func exec(_ sql: String, params: [Any?]) throws -> Int {
    try queue.sync { try _exec(sql, params: params) }
  }

  /// Führt mehrere Statements in EINER Transaktion und EINEM `queue.sync` aus (H8). `json` ist
  /// ein JSON-Array aus `{ "sql": "...", "params": [...] }`. Spart N fsyncs und N Bridge-Übergänge
  /// beim Massen-Upsert. Bei einem Fehler wird die gesamte Transaktion zurückgerollt (atomar).
  func execBatch(json: String) throws {
    // Parsen über NexusJSON (reines Obj-C @try/@catch) — siehe NexusJSON.h.
    guard let parsed = NexusJSON.object(from: json),
      let statements = parsed as? [[String: Any]]
    else {
      throw NexusError.database("execBatch: erwarte Array aus {sql, params}")
    }
    try queue.sync {
      try _exec("BEGIN IMMEDIATE", params: [])
      do {
        for s in statements {
          guard let sql = s["sql"] as? String else { continue }
          let params = (s["params"] as? [Any?]) ?? []
          try _exec(sql, params: params)
        }
        try _exec("COMMIT", params: [])
      } catch {
        try? _exec("ROLLBACK", params: [])
        throw error
      }
    }
  }

  @discardableResult
  private func _exec(_ sql: String, params: [Any?]) throws -> Int {
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
    try queue.sync { try _query(sql, params: params) }
  }

  private func _query(_ sql: String, params: [Any?]) throws -> [[String: Any]] {
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
