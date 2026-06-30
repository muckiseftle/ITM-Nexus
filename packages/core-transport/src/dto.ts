import type { AuthScheme } from './autodiscover-select';

/**
 * Feste Serverkonfiguration für den manuellen Modus (Experten-/Fallback-Pfad). Überspringt
 * Autodiscover und nutzt die angegebene EWS-URL direkt. Sinnvoll, wenn Autodiscover im
 * Firmennetz nicht freigegeben ist oder abweichende Hostnamen verwendet werden.
 */
export interface ManualServerConfig {
  readonly ewsUrl: string;
  readonly easUrl?: string;
}

/** Anmeldedaten. `secret` (Passwort/Token) wird niemals geloggt oder in JS persistiert. */
export interface Credentials {
  readonly username: string;
  readonly secret: string;
  readonly scheme: AuthScheme;
  /** Optionale NetBIOS-Domäne (NTLM), falls nicht bereits im Benutzernamen enthalten. */
  readonly domain?: string;
  /** Wenn gesetzt: Autodiscover überspringen und diese Serverkonfiguration verwenden. */
  readonly manual?: ManualServerConfig;
  /**
   * Wenn `true`: bewusst EWS statt EAS verwenden (Kompatibilitätsmodus). Standard `false`/
   * undefiniert ⇒ EAS bevorzugt.
   */
  readonly preferEws?: boolean;
  /**
   * Wenn `true`: bei einem EAS-Hardfailure automatisch auf EWS zurückfallen. Standard `false`/
   * undefiniert ⇒ **nur EAS** — scheitert EAS, kommt ein klarer Fehler (kein stiller EWS-Wechsel).
   */
  readonly easFallbackToEws?: boolean;
}

/** Vom Server/Autodiscover gemeldete Fähigkeiten — steuert die Protokollwahl im Hybrid. */
export interface TransportCapabilities {
  readonly ews: boolean;
  readonly activeSync: boolean;
  readonly directPush: boolean;
  readonly publicFolders: boolean;
  readonly delegation: boolean;
  readonly serverSearch: boolean;
}

export interface AutodiscoverResult {
  readonly emailAddress: string;
  readonly capabilities: TransportCapabilities;
  readonly auth: AuthScheme;
  readonly ewsUrl?: string;
  readonly easUrl?: string;
}

/** Generisches Delta-Sync-Ergebnis (EAS-SyncKey bzw. EWS-Watermark als `syncKey`). */
export interface SyncDelta<T> {
  readonly syncKey: string;
  readonly created: readonly T[];
  readonly updated: readonly T[];
  readonly deletedIds: readonly string[];
  readonly hasMore: boolean;
}

/** Heruntergeladener Anhangsinhalt (Base64) — vom Transport (EWS GetAttachment) geladen. */
export interface AttachmentContent {
  readonly id: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** Inhalt als Base64 (im nativen SecureStore/Cache; nie im Klartext geloggt). */
  readonly base64: string;
}
