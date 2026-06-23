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
} {
  const mailStore = new InMemoryMailStore();
  const folderStore = new InMemoryFolderStore();
  const calendarStore = new InMemoryCalendarStore();
  const contactStore = new InMemoryContactStore();
  const outbox = new OutboxProcessor(transport, mailStore, clock);
  const service = new BackgroundSyncService(
    new SyncService(transport, mailStore),
    new FolderSyncService(transport, folderStore),
    new CalendarService(transport, calendarStore),
    new ContactsService(transport, contactStore),
    outbox,
    clock,
    targets,
  );
  return { service, mailStore };
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
});
