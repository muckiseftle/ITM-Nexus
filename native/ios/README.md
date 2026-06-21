# native/ios — NEXUS-Kernmodul (Swift)

Implementiert die sicherheits-/performancekritischen Ports nativ für iOS/iPadOS/macOS
(„Thin-JS / Native-Core", ADR-001) und exportiert sie als React-Native-Modul `NexusNative`.

| Datei | Inhalt | Status |
|-------|--------|--------|
| `NexusSecureStore.swift` | Keychain-`SecureStore` (Enclave-gebunden, kein iCloud/Backup) | **vollständig** |
| `NexusDatabase.swift` | SQLCipher-DB + Schema (`messages`/`outbox`/FTS5), `dbInit/exec/query` | Schema vollständig, SQLCipher-Aufrufe beim Einbinden der Abhängigkeit aktivieren |
| `NexusTransport.swift` | EWS/EAS-Transport, Autodiscover, TLS + Certificate Pinning | Gerüst; Protokoll-Parsing iterativ |
| `NexusModule.swift` / `.m` | RN-Bridge (Promise-basiert) | **vollständig** |

> ⚠️ **Nicht in der CI/Linux-Umgebung baubar** — benötigt **Xcode** und die Pods
> `SQLCipher` sowie die React-Native-iOS-Artefakte.

## Build-Voraussetzungen

- Xcode 15+, iOS 16+ Deployment-Target.
- Abhängigkeiten via CocoaPods/SwiftPM: `SQLCipher` (DB-Verschlüsselung), `React`/`React-Core`.
- Dateien in das iOS-Projekt von `apps/nexus-mobile/ios` aufnehmen (Bridging-Header für `.m`).

## Sicherheits-Hinweise

- Keychain-Zugriffsklasse `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- DB-Master-Key wird zufällig erzeugt und im Keychain gehalten (ADR-005).
- Certificate Pinning ist Fail-Closed auszulegen; Pin-Set per MDM/AppConfig (On-Prem-CAs).
