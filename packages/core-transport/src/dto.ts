import type { AuthScheme } from './autodiscover-select';

/** Anmeldedaten. `secret` (Passwort/Token) wird niemals geloggt oder in JS persistiert. */
export interface Credentials {
  readonly username: string;
  readonly secret: string;
  readonly scheme: AuthScheme;
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
