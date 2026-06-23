/**
 * Background-Sync-*Planung* (rein, testbar) und DirectPush-Typen.
 *
 * Die zeitliche Entscheidung „was ist jetzt fällig?" liegt hier (deterministisch testbar);
 * die Ausführung (echte Server-Calls, iOS-BGTaskScheduler, EAS/EWS-Long-Poll) erfolgt im
 * Service bzw. nativen Modul. So bleibt die Sync-Strategie unabhängig von Plattform/Netzwerk.
 */

import type { AccountId, FolderId } from '@nexus/domain';

export type SyncKind = 'messages' | 'folders' | 'calendar' | 'contacts';

export interface SyncTarget {
  readonly kind: SyncKind;
  /** Nur für `messages`: der zu synchronisierende Ordner. */
  readonly folderId?: FolderId;
  /** Mindestabstand zwischen zwei Syncs dieses Ziels (ms). */
  readonly intervalMs: number;
}

/** Eindeutiger Schlüssel eines Ziels (für die „zuletzt ausgeführt"-Buchführung). */
export function targetKey(target: SyncTarget): string {
  return target.folderId !== undefined ? `${target.kind}:${target.folderId}` : target.kind;
}

/**
 * Liefert die jetzt fälligen Ziele: `now - lastRun >= intervalMs` (oder noch nie gelaufen).
 * Ergebnis ist nach „am längsten überfällig" sortiert (fairer, wenn das Zeitbudget knapp ist).
 */
export function dueSyncTargets(
  targets: readonly SyncTarget[],
  lastRun: Readonly<Record<string, number>>,
  now: number,
): readonly SyncTarget[] {
  return [...targets]
    .filter((t) => {
      const last = lastRun[targetKey(t)];
      return last === undefined || now - last >= t.intervalMs;
    })
    .sort((a, b) => {
      const la = lastRun[targetKey(a)] ?? 0;
      const lb = lastRun[targetKey(b)] ?? 0;
      return la - lb;
    });
}

/** Ergebnis eines DirectPush-„Ping" (EAS/EWS-Long-Poll). */
export interface PingResult {
  readonly status: 'changed' | 'timeout' | 'error';
  /** Bei `changed`: die Ordner mit Änderungen (treiben den anschließenden Sync). */
  readonly changedFolderIds: readonly FolderId[];
}

/**
 * Optionaler Push-Port (DirectPush). Vom nativen Connector implementiert; In-Memory/Tests
 * brauchen ihn nicht. `ping` blockiert bis zu `timeoutMs` und kehrt früher zurück, sobald der
 * Server eine Änderung meldet (server-getriebene Aktualisierung ohne Polling-Schleife).
 */
export interface PushTransport {
  ping(
    accountId: AccountId,
    folderIds: readonly FolderId[],
    timeoutMs: number,
  ): Promise<PingResult>;
}
