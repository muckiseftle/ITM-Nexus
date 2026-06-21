# Phase 4 — Security-Konzept

> Vollständiges Sicherheitskonzept für NEXUS. Anspruch: **sicherer als Outlook**.
> Grundsatz: **Security First, Privacy First** — Datensparsamkeit ist eine
> Sicherheitsmaßnahme, kein Marketing.

---

## 1. Schutzziele & Sicherheitsprinzipien

| Schutzziel | Bedeutung für NEXUS |
|------------|---------------------|
| **Vertraulichkeit** | Mails/Anhänge/Tokens at-rest & in-transit verschlüsselt |
| **Integrität** | keine Manipulation von Daten/Verbindungen (Pinning, HMAC) |
| **Verfügbarkeit** | Offline-Fähigkeit, robustes Sync, kein Single-Cloud-Ausfallpunkt |
| **Nachvollziehbarkeit** | auditierbares Verhalten, keine versteckte Telemetrie |
| **Datensouveränität** | Daten verlassen nie die Gerät↔Exchange-Strecke |

**Prinzipien:** Defense-in-Depth · Least-Privilege · Secure-by-Default · Zero-Telemetry ·
Datenminimierung · Fail-Closed bei Sicherheitsfehlern.

---

## 2. Threat-Model (STRIDE, verkürzt)

| Bedrohung | Beispiel | Hauptgegenmaßnahme |
|-----------|----------|--------------------|
| **Spoofing** | gefälschter Exchange-Endpoint, MITM | TLS + **Certificate Pinning**, Autodiscover-Validierung |
| **Tampering** | manipulierte Antworten/lokale DB | TLS-Integrität, SQLCipher-HMAC, signierte Updates |
| **Repudiation** | „Mail nicht gesendet" | Outbox-Audit-Log, S/MIME-Signatur |
| **Information Disclosure** | Geräteverlust, Klartext-Cache, Logs | At-rest-Verschlüsselung, Sandbox, Log-Redaction |
| **Denial of Service** | Sync-Sturm, Akkudrain | Backoff, gebündelte Wakeups, Ratenbegrenzung |
| **Elevation of Privilege** | Jailbreak/Root, App-Daten-Zugriff | Keychain/Enclave, Jailbreak-Erkennung (Policy), Pinning |

**Angreifermodelle:** Geräteverlust/-diebstahl · Netzwerk-MITM (offenes WLAN) ·
bösartige Anhänge/HTML · kompromittierte Plattform (Jailbreak/Root) · neugierige
App/OS-Nachbarn · Insider mit physischem Gerätezugriff.

---

## 3. Maßnahmen je Domäne

### 3.1 Secure-Storage (Keychain / Keystore)
- Credentials, OAuth-Token und DB-Master-Key **ausschließlich** in **Keychain (iOS/macOS)**
  bzw. **Android Keystore**; Schlüsselmaterial im **Secure Enclave / StrongBox** gebunden.
- iOS-Zugriffsklasse `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (kein iCloud-Keychain-Sync,
  kein Backup-Export).
- **Niemals** Secrets in `AsyncStorage`, JS-Speicher, Redux-State oder Logs.

### 3.2 Transport-Sicherheit (TLS + Pinning)
- TLS 1.2+ erzwungen, moderne Cipher-Suites; ATS (iOS) bzw. Network-Security-Config
  (Android) restriktiv.
- **Certificate Pinning** (Public-Key-Pinning, nicht Leaf-Cert) gegen MITM; Pin-Set per
  **MDM/AppConfig** für unternehmensinterne CAs konfigurierbar (On-Prem-Realität).
- Kein Fallback auf unverschlüsselte Verbindungen; **Fail-Closed**.

### 3.3 Lokale Verschlüsselung (at-rest)
- **SQLCipher** (AES-256) für die gesamte DB inkl. Index.
- **Anhänge** verschlüsselt im App-Sandbox-Container; kein Klartext im geteilten/temporären
  Cache; Klartext nur flüchtig zur Anzeige, danach gelöscht.
- Schlüsselableitung an Geräte-/Enclave-Schlüssel gebunden (siehe
  [ADR-005](./00-Architektur-Entscheidungen-ADR.md#adr-005--verschlüsselung-at-rest--key-management)).

### 3.4 HTML-Sanitizing & sicheres Rendering
- Mail-HTML wird **nativ sanitisiert** (Whitelist-basiert): Entfernen von `<script>`,
  Event-Handlern, externen Ressourcen.
- **Remote-Content (Bilder) standardmäßig blockiert** → Schutz vor Tracking-Pixeln;
  Nutzer/Policy kann freigeben.
- Rendering in isoliertem WebView mit deaktiviertem JS und Content-Security-Policy.
- Schutz vor Link-Spoofing: Anzeige der echten Ziel-URL bei Links.

### 3.5 Attachment-Security
- Anhänge werden **nie automatisch ausgeführt**; Vorschau in Sandbox/Quarantäne.
- Dateityp-/Größen-Policies (per MDM konfigurierbar); optional Blockieren riskanter Typen.
- „Öffnen in"/Teilen unterliegt MDM-Data-Loss-Prevention-Policies (Open-In-Management).

### 3.6 Session-Security
- **Biometrie-Gate** (Face ID/Touch ID/BiometricPrompt) und/oder App-PIN, per Policy
  erzwingbar; Auto-Lock nach Inaktivität.
- Auth-Token-Lebenszyklus: kurze Gültigkeit, sichere Erneuerung, Invalidierung bei Wipe.
- Kein Inhalt in App-Switcher-Snapshots (Screen-Privacy-Overlay beim Backgrounding).

### 3.7 Enterprise-Security-Policies & MDM
- Unterstützung für **Managed App Configuration** (iOS AppConfig / Android Managed
  Configurations) — Zero-Touch-Konfiguration & Policy-Durchsetzung.
- Policies u. a.: Pinning-Pins, erzwungene Biometrie, Copy/Paste-Restriktion,
  Open-In-Whitelist, Offline-Datenfenster, Remote-Wipe-Trigger, Jailbreak/Root-Block.
- Kompatibilität mit gängigen MDMs (Intune, Jamf, MobileIron/Ivanti, VMware Workspace ONE).

### 3.8 S/MIME
- **Signieren & Verschlüsseln** nativ über Plattform-Krypto.
- Zertifikats-Import via Keychain/Keystore und MDM-verteilte Zertifikate; Validierung der
  Vertrauenskette und Sperrprüfung (CRL/OCSP, wo erreichbar).
- Klare UI-Indikatoren für Signaturstatus/Verschlüsselung (kein „grünes Schloss"-Theater).

### 3.9 Datenlöschung & Remote-Wipe
- **Lokaler Wipe:** sicheres Löschen von DB-Master-Key (Krypto-Shredding) → Daten sofort
  unbrauchbar, plus Löschen der Dateien.
- **Remote-Wipe:** per MDM oder Exchange-Wipe-Kommando (EAS) ausgelöst.
- **Selbstzerstörung-Policy:** optional Wipe nach X Fehlversuchen Biometrie/PIN.

### 3.10 Privatsphäre / Zero-Telemetry
- **Keine** Analytics-/Tracking-SDKs, keine Crash-Reporter, die Inhalte exfiltrieren.
- Optionales, **lokales** Diagnose-Log (redacted, opt-in, nutzer-exportierbar) — verlässt
  das Gerät nie automatisch.
- Keine Werbung, keine Drittanbieter-IDs.

---

## 4. Risiko → Gegenmaßnahme (Übersicht)

| # | Risiko | Auswirkung | Gegenmaßnahme |
|---|--------|:---:|---------------|
| R1 | Geräteverlust/-diebstahl | Hoch | SQLCipher, Keychain/Enclave, Biometrie-Gate, Remote-Wipe |
| R2 | Netzwerk-MITM | Hoch | TLS 1.2+, Certificate Pinning, Fail-Closed |
| R3 | Tracking-Pixel / Schad-HTML | Mittel | Remote-Content-Block, natives Sanitizing, JS-frei |
| R4 | Bösartiger Anhang | Hoch | Quarantäne, keine Auto-Ausführung, Typ-Policies, DLP-Open-In |
| R5 | Secrets im JS/Log | Hoch | nur Keychain/Keystore, Log-Redaction, kein Secret in Bridge |
| R6 | Jailbreak/Root | Mittel | Erkennung + Policy (Block/Wipe), Enclave-Bindung |
| R7 | Akkudrain durch Direct Push | Mittel | gebündelte Wakeups, adaptives Heartbeat, Backoff |
| R8 | S/MIME-Fehlkonfiguration | Mittel | Ketten-/Sperrprüfung, klare Statusindikatoren |
| R9 | Datenabfluss über „Teilen/Open-In" | Mittel | MDM-DLP, Open-In-Whitelist, Copy/Paste-Restriktion |
| R10 | Supply-Chain (NPM/native Deps) | Hoch | Dependency-Pinning, SBOM, Audits, minimale Abhängigkeiten |
| R11 | Unsichere lokale Backups | Mittel | „NoBackup"-Flags, Exclude aus iCloud/Google-Backup |
| R12 | App-Switcher-Snapshot-Leak | Niedrig | Privacy-Overlay beim Backgrounding |

> Querbezug: technische/architektonische Risiken jenseits Security siehe
> [Phase 9 — Risikoanalyse](./09-Risikoanalyse.md).

---

## 5. Sicheres SDLC (Prozess)

- **Secure-by-Default-Reviews:** Sicherheits-Checkliste in jedem PR (Krypto, Secrets,
  Netzwerk, Daten-Persistenz).
- **Dependency-Hygiene:** minimale Abhängigkeiten, Lockfiles, automatisierte Audits, SBOM.
- **Statische Analyse & Secret-Scanning** in CI (Phase 10).
- **Pen-Test/Threat-Review** vor Major-Releases.
- **Verantwortliche Offenlegung:** Security-Kontakt & Prozess (security@itm-technologies.de).
