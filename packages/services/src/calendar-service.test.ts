import { toAccountId } from '@nexus/domain';
import type { CalendarEvent } from '@nexus/domain';
import type { SyncDelta } from '@nexus/core-transport';
import { describe, expect, it } from 'vitest';
import { CalendarService } from './calendar-service';
import { InMemoryCalendarStore } from './in-memory-store';
import { FakeMailTransport, makeEvent } from './testing/fakes';

const account = toAccountId('acc-1');

describe('CalendarService', () => {
  it('synchronisiert Termine und liefert die Agenda im Zeitfenster', async () => {
    const store = new InMemoryCalendarStore();
    const delta: SyncDelta<CalendarEvent> = {
      syncKey: 'sk-1',
      created: [
        makeEvent({ id: 'e1', accountId: account, startAt: 100, endAt: 200 }),
        makeEvent({ id: 'e2', accountId: account, startAt: 1000, endAt: 1100 }),
      ],
      updated: [],
      deletedIds: [],
      hasMore: false,
    };
    const service = new CalendarService(new FakeMailTransport({ calendarDelta: delta }), store);

    const result = await service.sync(account);
    expect(result.upserted).toBe(2);

    // Agenda für [0, 500): nur e1 schneidet das Fenster.
    const agenda = await service.agenda(account, 0, 500);
    expect(agenda.map((e) => e.id)).toEqual(['e1']);
  });

  it('entfernt gelöschte Termine', async () => {
    const store = new InMemoryCalendarStore();
    await store.upsertEvents([makeEvent({ id: 'e1', accountId: account, startAt: 0, endAt: 10 })]);
    const delta: SyncDelta<CalendarEvent> = {
      syncKey: 'sk-2',
      created: [],
      updated: [],
      deletedIds: ['e1'],
      hasMore: false,
    };
    const service = new CalendarService(new FakeMailTransport({ calendarDelta: delta }), store);

    const result = await service.sync(account, 'sk-1');
    expect(result.deleted).toBe(1);
    expect(await service.agenda(account, 0, 100)).toHaveLength(0);
  });
});
