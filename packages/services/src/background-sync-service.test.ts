import { describe, expect, it } from 'vitest';
import { toAccountId, toFolderId } from '@nexus/domain';
import type { PingResult, SyncTarget } from '@nexus/core-transport';
import { BackgroundSyncService } from './background-sync-service';
import { SyncService } from './sync-service';
import { FolderSyncService } from './folder-sync-service';
import { CalendarService } from './calendar-service';
import { ContactsService } from './contacts-service';
import { OutboxProcessor } from './outbox-processor';
import {
  InMemoryCalendarStore,
  InMemoryContactStore,
  InMemoryFolderStore,
  InMemoryMailStore,
  InMemorySyncCursorStore,
} from './in-memory-store';
import { FakeMailTransport, ManualClock, makeMessage } from './testing/fakes';

const account = toAccountId('acc');
const inbox = toFolderId('inbox');

const targets: readonly SyncTarget[] = [
  { kind: 'messages', folderId: inbox, intervalMs: 60_000 },
  { kind: 'folders', intervalMs: 300_000 },
  { kind: 'calendar', intervalMs: 600_000 },
  { kind: 'contacts', intervalMs: 600_000 },
];

function build(
  transport: FakeMailTransport,
  clock: ManualClock,
): {
  service: BackgroundSyncService;
  mailStore: InMemoryMailStore;
  cursors: InMemorySyncCursorStore;
} {
  const mailStore = new InMemoryMailStore();
  const folderStore = new InMemoryFolderStore();
  const calendarStore = new InMemoryCalendarStore();
  const contactStore = new InMemoryContactStore();
  const cursors = new InMemorySyncCursorStore();
  const outbox = new OutboxProcessor(transport, mailStore, clock);
  const service = new BackgroundSyncService(
    new SyncService(transport, mailStore),
    new FolderSyncService(transport, folderStore),
    new CalendarService(transport, calendarStore),
    new ContactsService(transport, contactStore),
    outbox,
    clock,
    targets,
    cursors,
  );
  return { service, mailStore, cursors };
}

describe('BackgroundSyncService', () => {
  it('führt beim ersten Lauf alle Ziele aus', async () => {
    const clock = new ManualClock(1_000_000);
    const { service } = build(new FakeMailTransport(), clock);

    const summary = await service.runDue(account);
    expect(summary.ran).toHaveLength(4);
  });

  it('respektiert die Intervalle bei aufeinanderfolgenden Läufen', async () => {
    const clock = new ManualClock(1_000_000);
    const { service } = build(new FakeMailTransport(), clock);

    await service.runDue(account);
    clock.advance(120_000); // 2 min: nur messages (60s) wieder fällig
    const summary = await service.runDue(account);
    expect(summary.ran).toEqual(['messages:inbox']);
  });

  it('synchronisiert bei einem DirectPush-Ping die gemeldeten Ordner', async () => {
    const clock = new ManualClock(1_000_000);
    const transport = new FakeMailTransport({
      messageDelta: {
        syncKey: 'sk-1',
        created: [makeMessage({ id: 'm1', accountId: account, folderId: inbox })],
        updated: [],
        deletedIds: [],
        hasMore: false,
      },
    });
    const { service, mailStore } = build(transport, clock);

    const ping: PingResult = { status: 'changed', changedFolderIds: [inbox] };
    const synced = await service.applyPing(account, ping);

    expect(synced).toEqual([inbox]);
    expect(await mailStore.listFolder(account, inbox, 10, 0)).toHaveLength(1);
  });

  it('ignoriert Timeout-/Fehler-Pings', async () => {
    const clock = new ManualClock(1_000_000);
    const { service } = build(new FakeMailTransport(), clock);
    expect(await service.applyPing(account, { status: 'timeout', changedFolderIds: [] })).toEqual(
      [],
    );
  });

  it('persistiert den Sync-Cursor und reicht ihn beim nächsten Lauf inkrementell ein', async () => {
    const clock = new ManualClock(1_000_000);
    const transport = new FakeMailTransport({
      messageDelta: { syncKey: 'sk-42', created: [], updated: [], deletedIds: [], hasMore: false },
    });
    const { service, cursors } = build(transport, clock);

    // Erster Lauf: ohne Cursor → Transport bekommt undefined, neuer Cursor wird gespeichert.
    await service.runDue(account);
    expect(transport.lastMessageSyncKey).toBeUndefined();
    expect(await cursors.getCursor('acc:messages:inbox')).toBe('sk-42');

    // Zweiter Lauf (messages wieder fällig): gespeicherter Cursor wird eingereicht.
    clock.advance(120_000);
    await service.runDue(account);
    expect(transport.lastMessageSyncKey).toBe('sk-42');
  });
});
