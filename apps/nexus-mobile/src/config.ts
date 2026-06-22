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
