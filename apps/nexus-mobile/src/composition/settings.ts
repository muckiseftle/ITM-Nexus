import type { SecureStore } from '@nexus/core-transport';

/**
 * Persistente App-Einstellungen (im SecureStore abgelegt — Keychain im Live-Modus, In-Memory im
 * Demo-Modus). Bewusst schlank: nur Werte, die das Verhalten/die Anzeige steuern. Der
 * Aktualisierungs-Intervall steuert den Vordergrund-Sync tatsächlich (siehe App.tsx).
 */
/** Gespeicherte Kalenderansicht (zuletzt gewählt; wird beim Neustart wiederhergestellt). */
export type CalendarView = 'list' | 'day' | 'week' | 'month';

export interface AppSettings {
  /** Schlüssel aus {@link INTERVAL_OPTS}; steuert den Vordergrund-Sync-Intervall. */
  readonly syncInterval: string;
  /** Schlüssel aus {@link WINDOW_OPTS}; wie weit zurück Mails geladen werden (Anzeige-/Sync-Wunsch). */
  readonly syncWindow: string;
  /** App-Sperre per Biometrie/Code beim Start und nach Rückkehr aus dem Hintergrund. */
  readonly appLock: boolean;
  /** DirectPush-Long-Poll (sofortige neue Mails). Aus ⇒ nur Intervall-Sync. */
  readonly push: boolean;
  /** iOS-Hintergrund-Sync (BGTaskScheduler) bei geschlossener App planen. */
  readonly background: boolean;
  /** Nur über WLAN synchronisieren (kein Sync/Push über Mobilfunk). */
  readonly wifiOnly: boolean;
  /** Zuletzt gewählte Kalenderansicht — beim nächsten Start wiederhergestellt. */
  readonly calendarView: CalendarView;
  /** Aktivierte freigegebene Kalender (E-Mail-Adressen), die im Kalender überlagert werden. */
  readonly calendarSources: readonly string[];
}

const CALENDAR_VIEWS: readonly CalendarView[] = ['list', 'day', 'week', 'month'];

export const INTERVAL_OPTS = [
  { key: '1m', label: 'Alle 1 Minute' },
  { key: '5m', label: 'Alle 5 Minuten' },
  { key: '15m', label: 'Alle 15 Minuten' },
  { key: '30m', label: 'Alle 30 Minuten' },
  { key: 'manual', label: 'Manuell (nur Push)' },
] as const;

export const WINDOW_OPTS = [
  { key: '1w', label: '1 Woche' },
  { key: '1m', label: '1 Monat' },
  { key: '3m', label: '3 Monate' },
  { key: '6m', label: '6 Monate' },
  { key: 'all', label: 'Alle Nachrichten' },
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  syncInterval: '1m',
  syncWindow: '1m',
  appLock: false,
  push: true,
  background: true,
  wifiOnly: false,
  calendarView: 'list',
  calendarSources: [],
};

const SETTINGS_KEY = 'nexus:settings';

/** Wandelt einen Intervall-Schlüssel in Millisekunden. `null` = manuell (kein Poll-Intervall). */
export function syncIntervalMs(key: string): number | null {
  switch (key) {
    case '1m':
      return 60_000;
    case '5m':
      return 300_000;
    case '15m':
      return 900_000;
    case '30m':
      return 1_800_000;
    default:
      return null; // 'manual'
  }
}

/** Lesbares Label zu einem Options-Schlüssel (Fallback: der Schlüssel selbst). */
export function labelOf(
  opts: readonly { readonly key: string; readonly label: string }[],
  key: string,
): string {
  return opts.find((o) => o.key === key)?.label ?? key;
}

export async function loadSettings(secureStore: SecureStore): Promise<AppSettings> {
  try {
    const raw = await secureStore.get(SETTINGS_KEY);
    if (raw === undefined) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      syncInterval:
        typeof parsed.syncInterval === 'string'
          ? parsed.syncInterval
          : DEFAULT_SETTINGS.syncInterval,
      syncWindow:
        typeof parsed.syncWindow === 'string' ? parsed.syncWindow : DEFAULT_SETTINGS.syncWindow,
      appLock: typeof parsed.appLock === 'boolean' ? parsed.appLock : DEFAULT_SETTINGS.appLock,
      push: typeof parsed.push === 'boolean' ? parsed.push : DEFAULT_SETTINGS.push,
      background:
        typeof parsed.background === 'boolean' ? parsed.background : DEFAULT_SETTINGS.background,
      wifiOnly: typeof parsed.wifiOnly === 'boolean' ? parsed.wifiOnly : DEFAULT_SETTINGS.wifiOnly,
      calendarView:
        typeof parsed.calendarView === 'string' && CALENDAR_VIEWS.includes(parsed.calendarView)
          ? parsed.calendarView
          : DEFAULT_SETTINGS.calendarView,
      calendarSources:
        Array.isArray(parsed.calendarSources) &&
        parsed.calendarSources.every((x) => typeof x === 'string')
          ? parsed.calendarSources
          : DEFAULT_SETTINGS.calendarSources,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(secureStore: SecureStore, settings: AppSettings): Promise<void> {
  await secureStore.set(SETTINGS_KEY, JSON.stringify(settings));
}
