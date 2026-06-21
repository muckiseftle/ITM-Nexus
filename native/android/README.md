# native/android — NEXUS-Kernmodul (Kotlin)

Implementiert die sicherheits-/performancekritischen Ports nativ für Android
(„Thin-JS / Native-Core", ADR-001) und exportiert sie als React-Native-Modul `NexusNative`.

| Datei | Inhalt | Status |
|-------|--------|--------|
| `NexusSecureStore.kt` | Keystore + EncryptedSharedPreferences (`SecureStore`) | **vollständig** |
| `NexusDatabase.kt` | SQLCipher-DB + Schema (`messages`/`outbox`/FTS5), `dbInit/exec/query` | Schema vollständig, SQLCipher-Aufrufe beim Einbinden der Abhängigkeit aktivieren |
| `NexusTransport.kt` | EWS/EAS-Transport, Autodiscover, TLS + Pinning (OkHttp) | Gerüst; Protokoll-Parsing iterativ |
| `NexusModule.kt` / `NexusPackage.kt` | RN-Bridge + ReactPackage | **vollständig** |

> ⚠️ **Nicht in der CI/Linux-Umgebung baubar** — benötigt das **Android SDK/NDK** und die
> React-Native-Android-Artefakte.

## Build-Voraussetzungen

- Android SDK 34+, min SDK 26 (StrongBox/Keystore).
- Abhängigkeiten (Gradle): `androidx.security:security-crypto`,
  `net.zetetic:android-database-sqlcipher`, `com.squareup.okhttp3:okhttp`,
  React-Native-Android-Artefakte.
- `NexusPackage` in `MainApplication.getPackages()` registrieren.

## Sicherheits-Hinweise

- EncryptedSharedPreferences (AES-256), StrongBox-gebundener Masterkey.
- DB-Master-Key zufällig erzeugt und im Keystore gehalten (ADR-005).
- Certificate Pinning Fail-Closed; Pin-Set per MDM/Managed Configurations (On-Prem-CAs).
