import type { AccountId, CalendarEvent } from '@nexus/domain';
import type { CalendarStore, MailTransport } from '@nexus/core-transport';

export interface CalendarSyncResult {
  readonly syncKey: string;
  readonly upserted: number;
  readonly deleted: number;
  readonly hasMore: boolean;
}

/** Orchestriert Kalender-Delta-Sync und liefert die Tages-/Zeitraum-Agenda aus dem Store. */
export class CalendarService {
  constructor(
    private readonly transport: MailTransport,
    private readonly store: CalendarStore,
  ) {}

  async sync(accountId: AccountId, syncKey?: string): Promise<CalendarSyncResult> {
    const delta = await this.transport.syncCalendar(accountId, syncKey);

    const changed = [...delta.created, ...delta.updated];
    if (changed.length > 0) {
      await this.store.upsertEvents(changed);
    }
    if (delta.deletedIds.length > 0) {
      await this.store.deleteEvents(accountId, delta.deletedIds);
    }

    return {
      syncKey: delta.syncKey,
      upserted: changed.length,
      deleted: delta.deletedIds.length,
      hasMore: delta.hasMore,
    };
  }

  agenda(accountId: AccountId, fromMs: number, toMs: number): Promise<readonly CalendarEvent[]> {
    return this.store.listRange(accountId, fromMs, toMs);
  }
}
