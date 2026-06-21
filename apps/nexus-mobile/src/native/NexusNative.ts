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

  // — Exchange-Transport (EWS/EAS, TLS+Pinning) — Rückgaben sind JSON-Strings —
  transportDiscover(email: string, credentialsJson: string): Promise<string>;
  transportSyncMessages(
    accountId: string,
    folderId: string,
    syncKey: string | null,
  ): Promise<string>;
  transportApplyOperation(operationJson: string): Promise<void>;
  transportSendMessage(accountId: string, messageJson: string): Promise<string>;
  transportSearchServer(accountId: string, query: string): Promise<string>;
}

const native = NativeModules.NexusNative as NexusNativeModule | undefined;

if (native === undefined) {
  throw new Error(
    'Natives Modul "NexusNative" nicht gefunden. iOS: Pods installieren & neu bauen; ' +
      'Android: NexusPackage registrieren. Siehe docs/11-Native-und-App.md.',
  );
}

export const NexusNative: NexusNativeModule = native;
