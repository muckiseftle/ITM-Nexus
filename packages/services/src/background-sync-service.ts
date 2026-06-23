import type { AccountId, FolderId } from '@nexus/domain';
import type { Clock, PingResult, SyncTarget } from '@nexus/core-transport';
import { dueSyncTargets, targetKey } from '@nexus/core-transport';
import type { SyncService } from './sync-service';
import type { FolderSyncService } from './folder-sync-service';
import type { CalendarService } from './calendar-service';
import type { ContactsService } from './contacts-service';
import type { OutboxProcessor } from './outbox-processor';

export interface BackgroundSyncSummary {
  /** Schlüssel der ausgeführten Sync-Ziele. */
  readonly ran: readonly string[];
  /** Anzahl verarbeiteter Outbox-Operationen. */
  readonly outboxProcessed: number;
}

/**
 * Treibt periodische Hintergrund-Synchronisation und DirectPush-getriebene Sofort-Syncs.
 * Die Fälligkeitsentscheidung kommt aus der reinen {@link dueSyncTargets}-Policy; dieser
 * Service führt sie über die getesteten Sync-Services aus und leert anschließend die Outbox.
 * Auslöser (iOS-BGTaskScheduler bzw. Push-Long-Poll) liegen im nativen Modul/der App.
 */
export class BackgroundSyncService {
  private readonly lastRun = new Map<string, number>();

  constructor(
    private readonly messages: SyncService,
    private readonly folders: FolderSyncService,
    private readonly calendar: CalendarService,
    private readonly contacts: ContactsService,
    private readonly outbox: OutboxProcessor,
    private readonly clock: Clock,
    private readonly targets: readonly SyncTarget[],
  ) {}

  /** Führt alle aktuell fälligen Sync-Ziele aus und verarbeitet die Outbox. */
  async runDue(
    accountId: AccountId,
    now: number = this.clock.now(),
  ): Promise<BackgroundSyncSummary> {
    const due = dueSyncTargets(this.targets, Object.fromEntries(this.lastRun), now);
    const ran: string[] = [];
    for (const target of due) {
      await this.runTarget(accountId, target);
      this.lastRun.set(targetKey(target), now);
      ran.push(targetKey(target));
    }
    const summary = await this.outbox.drain(accountId);
    return { ran, outboxProcessed: summary.processed };
  }

  /**
   * Reagiert auf einen DirectPush-Ping: synchronisiert die gemeldeten Ordner sofort und leert
   * die Outbox. Liefert die tatsächlich synchronisierten Ordner.
   */
  async applyPing(accountId: AccountId, result: PingResult): Promise<readonly FolderId[]> {
    if (result.status !== 'changed' || result.changedFolderIds.length === 0) {
      return [];
    }
    for (const folderId of result.changedFolderIds) {
      await this.messages.syncMessages(accountId, folderId);
      this.lastRun.set(`messages:${folderId}`, this.clock.now());
    }
    await this.outbox.drain(accountId);
    return result.changedFolderIds;
  }

  private runTarget(accountId: AccountId, target: SyncTarget): Promise<unknown> {
    switch (target.kind) {
      case 'messages':
        return target.folderId !== undefined
          ? this.messages.syncMessages(accountId, target.folderId)
          : Promise.resolve();
      case 'folders':
        return this.folders.sync(accountId);
      case 'calendar':
        return this.calendar.sync(accountId);
      case 'contacts':
        return this.contacts.sync(accountId);
    }
  }
}
