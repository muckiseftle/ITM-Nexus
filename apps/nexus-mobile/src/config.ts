/**
 * App-Konfiguration.
 *
 * `APP_MODE`:
 * - `'demo'` — startet mit In-Memory-Adaptern + Beispieldaten, **ohne Server/native Module**.
 *   Standard, damit die App sofort auf Gerät/Simulator läuft (siehe docs/11-Native-und-App.md).
 * - `'live'` — nutzt die nativen Module (Keychain/Keystore, SQLCipher, EWS/EAS-Transport).
 */
export const APP_MODE: 'demo' | 'live' = 'demo';

/** Demo-Konto-ID, die die Screens für lokale Abfragen nutzen (passt zu demo-seed). */
export const DEMO_ACCOUNT_ID = 'demo';
export const DEMO_INBOX_ID = 'inbox';

/**
 * Certificate-Pinning-Policy (Security-First, fail-closed — siehe core-transport/pinning.ts).
 * **Leer ⇒ Pinning inaktiv** (System-Trust). Die IT hinterlegt hier pro Server-Host die
 * SPKI-Pins `base64(SHA-256(SubjectPublicKeyInfo))` (inkl. Backup-Pin), z. B.:
 *
 *   { host: 'mail.firma.de', pins: ['<primär>', '<backup>'], includeSubdomains: false }
 *
 * Pin ermitteln: `openssl s_client -connect host:443 | openssl x509 -pubkey -noout \
 *   | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`
 */
export const PINNING: { readonly policies: readonly PinPolicyEntry[] } = {
  policies: [],
};

export interface PinPolicyEntry {
  readonly host: string;
  readonly pins: readonly string[];
  readonly includeSubdomains?: boolean;
}

/** Hintergrund-Sync-Ziele und ihre Mindestintervalle (ms). */
export const SYNC_INTERVALS = {
  messages: 60_000,
  folders: 300_000,
  calendar: 600_000,
  contacts: 600_000,
} as const;

/** Timeout für einen DirectPush-Long-Poll (ms). */
export const PUSH_TIMEOUT_MS = 300_000;

/**
 * Stabilitäts-Schalter für die Start-Operationen. Auf Sideload-Builds (kostenlose Apple-ID,
 * KEIN Background-Entitlement) werfen `BGTaskScheduler` und der DirectPush-Long-Poll
 * NSExceptions, welche die RN-Bridge zum Absturz bringen — und sie bringen dort ohnehin keinen
 * Nutzen. Daher vorerst AUS: Der Kern (sichere Ablage, verschlüsselte DB, Vordergrund-EWS-Sync)
 * bleibt voll funktionsfähig. Für einen ordentlich signierten Build (mit Entitlements) können
 * diese Schalter wieder aktiviert werden.
 *
 * Bewusst als `: boolean` typisiert (nicht als Literal), damit die abhängigen Bedingungen nicht
 * als „immer falsch" gewertet werden.
 */
// DirectPush ist jetzt echtes EAS-`Ping` (Vordergrund-Long-Poll, KEIN Background-Entitlement
// nötig) → aktiv. Zusätzlich pro Konto über die Einstellung „Push" gegated.
export const ENABLE_DIRECT_PUSH: boolean = true;
// BGTaskScheduler braucht ein Background-Entitlement, das Sideload-Builds fehlt → bleibt AUS
// (auch sicher in NexusBGTasks @try/@catch gekapselt, liefe dort aber ohnehin nicht).
export const ENABLE_BACKGROUND_TASKS: boolean = false;
/**
 * Automatischer Vordergrund-Sync direkt nach dem Anmelden („Mails beim Login"). Aktiv, seit der
 * Sync schlank ist (EAS BodyPreference-Truncation bzw. EWS Text-Body + HTML-on-open) — kein
 * Speicher-Spike/Jetsam mehr.
 */
export const ENABLE_FOREGROUND_SYNC: boolean = true;
