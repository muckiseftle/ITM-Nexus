import {
  hasFlag,
  markRead,
  withFlag,
  withoutFlag,
  MessageFlag,
  toFolderId,
  type AccountId,
  type FolderId,
  type MailMessage,
} from '@nexus/domain';
import { createOperation, outboxCommand } from '@nexus/core-transport';
import type { AppContainer } from '../composition/container';

/**
 * Nachrichten-Aktionen für die UI. Sie folgen dem Offline-first-Muster der Architektur:
 * **optimistisch** den lokalen Store aktualisieren (UI reagiert sofort) **und** die
 * passende Outbox-Operation einreihen (der Transport gleicht später mit dem Server ab).
 * Im Demo-Modus ist der Transport ein No-op — die lokale Änderung bleibt dennoch sichtbar.
 */

// Ziel für „Archivieren". EWS mappt 'archive' serverseitig auf die DistinguishedFolderId.
const ARCHIVE_FOLDER: FolderId = toFolderId('archive');

let opCounter = 0;
function nextOperationId(prefix: string, messageId: string): string {
  opCounter += 1;
  return `${prefix}-${messageId}-${String(Date.now())}-${String(opCounter)}`;
}

async function enqueue(
  container: AppContainer,
  account: AccountId,
  prefix: string,
  messageId: string,
  command: ReturnType<(typeof outboxCommand)[keyof typeof outboxCommand]>,
): Promise<void> {
  await container.outbox.enqueue(
    account,
    createOperation(nextOperationId(prefix, messageId), account, command, Date.now()),
  );
  await container.outbox.drain(account);
}

/** Gelesen-Status umschalten (optimistisch + Outbox). Liefert die aktualisierte Nachricht. */
export async function setRead(
  container: AppContainer,
  account: AccountId,
  message: MailMessage,
  read: boolean,
): Promise<MailMessage> {
  const updated = markRead(message, read);
  await container.mailStore.upsertMessages([updated]);
  await enqueue(container, account, 'read', message.id, outboxCommand.markRead(message.id, read));
  return updated;
}

/** Markierungs-Flag umschalten (optimistisch + Outbox). */
export async function toggleFlag(
  container: AppContainer,
  account: AccountId,
  message: MailMessage,
): Promise<MailMessage> {
  const flagged = hasFlag(message, MessageFlag.Flagged);
  const updated = flagged
    ? withoutFlag(message, MessageFlag.Flagged)
    : withFlag(message, MessageFlag.Flagged);
  await container.mailStore.upsertMessages([updated]);
  await enqueue(
    container,
    account,
    'flag',
    message.id,
    outboxCommand.flag(message.id, MessageFlag.Flagged, !flagged),
  );
  return updated;
}

/** In einen beliebigen Ordner verschieben (optimistisch + Outbox). */
export async function moveToFolder(
  container: AppContainer,
  account: AccountId,
  message: MailMessage,
  targetFolderId: FolderId,
): Promise<void> {
  await container.mailStore.upsertMessages([{ ...message, folderId: targetFolderId }]);
  await enqueue(
    container,
    account,
    'move',
    message.id,
    outboxCommand.move(message.id, targetFolderId),
  );
}

/** In den Archiv-Ordner verschieben (optimistisch + Outbox). */
export async function archive(
  container: AppContainer,
  account: AccountId,
  message: MailMessage,
): Promise<void> {
  await moveToFolder(container, account, message, ARCHIVE_FOLDER);
}

/** Nachricht löschen (optimistisch aus dem Store entfernen + Outbox). */
export async function remove(
  container: AppContainer,
  account: AccountId,
  message: MailMessage,
): Promise<void> {
  await container.mailStore.deleteMessages(account, [message.id]);
  await enqueue(container, account, 'del', message.id, outboxCommand.remove(message.id));
}
