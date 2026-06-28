import { NativeModules } from 'react-native';

/**
 * Oberfläche des nativen NEXUS-Kernmoduls (Swift/Kotlin). Bewusst schmal gehalten
 * („Thin-JS / Native-Core", ADR-001): das native Modul liefert die sicherheits-/
 * performancekritischen Primitive — Secure-Storage, verschlüsselte DB (SQLCipher) und
 * den Exchange-Transport (EWS/EAS) — alles JSON-serialisiert über die Bridge.
 *
 * Die JS-Adapter in `./adapters.ts` implementieren die @nexus/core-transport-Ports
 * (`SecureStore`, `MailStore`, `MailTransport`) auf Basis dieser Oberfläche.
 */
export interface NexusNativeModule {
  // — Secure-Storage (Keychain / Android Keystore) —
  secureSet(key: string, value: string): Promise<void>;
  secureGet(key: string): Promise<string | null>;
  secureDelete(key: string): Promise<void>;
  secureWipe(): Promise<void>;

  // — Verschlüsselte lokale DB (SQLCipher) —
  dbInit(): Promise<void>;
  dbExec(sql: string, params: readonly (string | number | null)[]): Promise<number>;
  dbQuery(
    sql: string,
    params: readonly (string | number | null)[],
  ): Promise<readonly Record<string, string | number | null>[]>;
  /** Mehrere Statements atomar in EINER Transaktion (BEGIN/…/COMMIT) — Massen-Upsert (H8). */
  dbExecBatch(stmtsJson: string): Promise<void>;
  /** Leert die lokale DB (Schlüssel/Zugangsdaten bleiben) — „Lokalen Cache leeren". */
  dbReset(): Promise<void>;

  // — Exchange-Transport (EWS/EAS, TLS+Pinning) — Rückgaben sind JSON-Strings —
  transportDiscover(email: string, credentialsJson: string): Promise<string>;
  /** Authentifizierter EWS-Roundtrip zur Anmeldeprüfung — rejectet bei 401/403/Serverfehler. */
  transportVerify(email: string): Promise<string>;
  /** Setzt das Passwort neu + prüft es (rejectet bei 401/403). Persistenz erfolgt in JS. */
  transportUpdatePassword(email: string, password: string): Promise<string>;
  /** Stellt die Sitzung aus dem Keychain wieder her (kein Netz). Liefert accountId oder null. */
  transportRestore(): Promise<string | null>;
  // syncKey: leerer String "" = Erst-Sync (NIE null — JS-null würde als NSString-Parameter zu
  // NSNull und die RN-Bridge stürzte bei -[NSNull length] ab).
  transportSyncMessages(accountId: string, folderId: string, syncKey: string): Promise<string>;
  transportApplyOperation(operationJson: string): Promise<void>;
  transportSendMessage(accountId: string, messageJson: string): Promise<string>;
  /** Speichert die Nachricht als Entwurf (EWS SaveOnly → Ordner „Entwürfe"). Liefert JSON {id}. */
  transportSaveDraft(accountId: string, messageJson: string): Promise<string>;
  /** Öffnet den System-Dateiauswähler; resolved die Datei, rejectet bei Abbruch ('CANCELLED'). */
  pickAttachment(): Promise<{
    readonly name: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly base64: string;
  }>;
  transportSearchServer(accountId: string, query: string): Promise<string>;
  transportLoadAccount(accountId: string): Promise<string>;
  transportSyncFolders(accountId: string, syncKey: string): Promise<string>;
  transportSyncCalendar(accountId: string, syncKey: string): Promise<string>;
  transportSyncContacts(accountId: string, syncKey: string): Promise<string>;
  transportGetMessage(accountId: string, messageId: string): Promise<string>;

  // — EAS (ActiveSync) Diagnose (dark): OPTIONS → Provision → FolderSync „0" —
  transportEasProbe(accountId: string, easUrl: string): Promise<string>;

  // — TLS-Pinning & DirectPush —
  transportConfigurePinning(pinsJson: string): Promise<void>;
  // Zuletzt genutztes Mail-Protokoll des Kontos (eas/ews/unbekannt) für die UI-Anzeige.
  transportActiveProtocol(accountId: string): Promise<string>;
  // TOFU: Zertifikat lesen (Fingerprint/Subject) bzw. vom Nutzer bestätigten Pin speichern.
  transportProbeCertificate(host: string): Promise<string>;
  transportTrustCertificate(host: string, spki: string): Promise<void>;
  transportPing(accountId: string, folderIdsJson: string, timeoutSec: number): Promise<string>;

  // — iOS-Hintergrund-Sync (BGTaskScheduler) —
  transportScheduleBackgroundSync(): Promise<void>;

  // — Anhänge (EWS GetAttachment) — Rückgabe ist JSON-String —
  transportGetAttachment(accountId: string, attachmentId: string): Promise<string>;
  /** Lädt + dekodiert den Anhang nativ in eine Datei und öffnet das System-Teilen-Blatt (H9). */
  transportPresentAttachment(accountId: string, attachmentId: string): Promise<void>;

  // — Freigegebene Postfächer (Delegation) — Rückgaben sind JSON-Strings —
  /** Prüft serverseitig den Zugriff auf ein freigegebenes Postfach. Rejectet ohne Berechtigung. */
  transportVerifySharedMailbox(accountId: string, owner: string): Promise<string>;
  /** Liest (nur lesend) den Posteingang eines freigegebenen Postfachs. Rejectet ohne Berechtigung. */
  transportSyncSharedInbox(accountId: string, owner: string): Promise<string>;

  // — Crash-Diagnose (On-Device, kein Cloud) —
  /** Letzter nativer Crash-Bericht (NSException-`reason`/Signal-Backtrace) oder null. */
  crashLastReport(): Promise<string | null>;
  /** Löscht den gespeicherten Crash-Bericht (nach dem Anzeigen). */
  crashClearReport(): Promise<void>;

  // — Netzwerkstatus (für „Nur über WLAN") —
  /** Aktueller Verbindungstyp: 'wifi' | 'cellular' | 'none'. */
  networkStatus(): Promise<string>;

  // — App-Sperre (Biometrie / Face ID / Touch ID) —
  /** Verfügbarkeit + Typ der Geräte-Biometrie. */
  biometricAvailable(): Promise<{ readonly available: boolean; readonly type: string }>;
  /** Fordert Entsperrung an (Biometrie + Code-Fallback). Resolved true, rejectet bei Fehlschlag. */
  biometricAuthenticate(reason: string): Promise<boolean>;
}

function resolveNative(): NexusNativeModule {
  const native = NativeModules.NexusNative as NexusNativeModule | undefined;
  if (native === undefined) {
    throw new Error(
      'Natives Modul "NexusNative" nicht gefunden. Wird nur im Live-Modus benötigt — ' +
        'iOS: Pods installieren & neu bauen; Android: NexusPackage registrieren. ' +
        'Siehe docs/11-Native-und-App.md.',
    );
  }
  return native;
}

/**
 * **Lazy** Zugriff: Das native Modul wird erst beim tatsächlichen Methodenaufruf aufgelöst,
 * nicht beim Import. So bleibt der **Demo-Modus** (In-Memory, ohne native Module) lauffähig,
 * selbst wenn `NexusNative` gar nicht eingebunden ist.
 */
export const NexusNative: NexusNativeModule = new Proxy({} as NexusNativeModule, {
  get(_target, property: string | symbol) {
    const native = resolveNative() as unknown as Record<string | symbol, unknown>;
    return native[property];
  },
});
