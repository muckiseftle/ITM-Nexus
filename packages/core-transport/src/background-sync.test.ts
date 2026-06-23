import { describe, expect, it } from 'vitest';
import { toFolderId } from '@nexus/domain';
import { dueSyncTargets, targetKey, type SyncTarget } from './background-sync';

const inbox = toFolderId('inbox');

const targets: readonly SyncTarget[] = [
  { kind: 'messages', folderId: inbox, intervalMs: 60_000 },
  { kind: 'folders', intervalMs: 300_000 },
  { kind: 'calendar', intervalMs: 600_000 },
];

describe('targetKey', () => {
  it('bezieht den Ordner für messages ein', () => {
    expect(targetKey({ kind: 'messages', folderId: inbox, intervalMs: 1 })).toBe('messages:inbox');
    expect(targetKey({ kind: 'folders', intervalMs: 1 })).toBe('folders');
  });
});

describe('dueSyncTargets', () => {
  it('liefert nie gelaufene Ziele', () => {
    const due = dueSyncTargets(targets, {}, 1_000_000);
    expect(due).toHaveLength(3);
  });

  it('filtert noch nicht fällige Ziele heraus', () => {
    const now = 1_000_000;
    const lastRun = {
      'messages:inbox': now - 30_000, // erst 30s her → nicht fällig (Intervall 60s)
      folders: now - 400_000, // fällig
      calendar: now - 100_000, // nicht fällig
    };
    const due = dueSyncTargets(targets, lastRun, now).map(targetKey);
    expect(due).toEqual(['folders']);
  });

  it('sortiert am längsten überfällige zuerst', () => {
    const now = 2_000_000;
    const lastRun = { 'messages:inbox': now - 120_000, folders: now - 900_000 };
    // calendar nie gelaufen (lastRun 0) → am längsten überfällig, dann folders, dann messages.
    const due = dueSyncTargets(targets, lastRun, now).map((t) => t.kind);
    expect(due).toEqual(['calendar', 'folders', 'messages']);
  });
});
