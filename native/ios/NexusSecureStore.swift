import Foundation
import Security

/// Sicherer Schlüssel/Wert-Speicher auf Basis der iOS/macOS-Keychain.
/// Implementiert den `SecureStore`-Port (siehe @nexus/core-transport).
/// Zugriffsklasse: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — kein iCloud-Sync,
/// kein Backup-Export (siehe ADR-005 / Security-Konzept).
enum NexusSecureStore {
  private static let service = "de.itmtechnologies.nexus"

  private static func baseQuery(_ key: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
  }

  static func set(_ key: String, value: String) throws {
    let data = Data(value.utf8)
    var query = baseQuery(key)

    // Vorhandenen Eintrag aktualisieren oder neu anlegen.
    let attributesToUpdate: [String: Any] = [kSecValueData as String: data]
    let status = SecItemUpdate(query as CFDictionary, attributesToUpdate as CFDictionary)

    if status == errSecItemNotFound {
      query[kSecValueData as String] = data
      query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
      let addStatus = SecItemAdd(query as CFDictionary, nil)
      guard addStatus == errSecSuccess else { throw NexusError.keychain(addStatus) }
    } else if status != errSecSuccess {
      throw NexusError.keychain(status)
    }
  }

  static func get(_ key: String) throws -> String? {
    var query = baseQuery(key)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = item as? Data else {
      throw NexusError.keychain(status)
    }
    return String(decoding: data, as: UTF8.self)
  }

  static func delete(_ key: String) throws {
    let status = SecItemDelete(baseQuery(key) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw NexusError.keychain(status)
    }
  }

  /// Krypto-Shredding: entfernt alle Einträge des Service (lokaler/remote Wipe).
  static func wipe() throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
    ]
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw NexusError.keychain(status)
    }
  }
}

enum NexusError: Error {
  case keychain(OSStatus)
  case database(String)
  case transport(String)
}
