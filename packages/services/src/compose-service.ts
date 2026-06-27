import type {
  AccountId,
  Mailbox,
  MailAddress,
  MessageBody,
  MessageId,
  OutgoingAttachment,
  OutgoingMessage,
  Recipient,
} from '@nexus/domain';
import { resolveSenderIdentity } from '@nexus/domain';
import type { Clock } from '@nexus/core-transport';
import { createOperation, outboxCommand } from '@nexus/core-transport';
import type { OutboxProcessor } from './outbox-processor';

/** Entwurf aus dem Composer (ohne Sende-Identität — die wird hier aufgelöst). */
export interface Draft {
  readonly subject: string;
  readonly body: MessageBody;
  readonly recipients: readonly Recipient[];
  readonly inReplyTo?: MessageId;
  readonly attachments?: readonly OutgoingAttachment[];
}

/**
 * Stellt ausgehende Nachrichten zusammen und reiht sie in die Outbox ein. Löst die
 * Sende-Identität aus dem aktiven Postfach auf (SendAs / SendOnBehalf, siehe
 * {@link resolveSenderIdentity}) und nutzt `operationId` als Idempotenz-Schlüssel.
 */
export class ComposeService {
  constructor(
    private readonly outbox: OutboxProcessor,
    private readonly clock: Clock,
  ) {}

  /**
   * Baut die ausgehende Nachricht (Sende-Identität auflösen, Anhänge übernehmen) OHNE sie zu
   * versenden — genutzt von {@link send} und vom Entwurf-Speichern (Composer → transportSaveDraft).
   */
  buildMessage(activeMailbox: Mailbox, primaryAddress: MailAddress, draft: Draft): OutgoingMessage {
    const identity = resolveSenderIdentity(activeMailbox, primaryAddress);
    return {
      from: identity.from,
      ...(identity.sender !== undefined ? { sender: identity.sender } : {}),
      subject: draft.subject,
      body: draft.body,
      recipients: draft.recipients,
      ...(draft.inReplyTo !== undefined ? { inReplyTo: draft.inReplyTo } : {}),
      ...(draft.attachments !== undefined && draft.attachments.length > 0
        ? { attachments: draft.attachments }
        : {}),
    };
  }

  async send(
    accountId: AccountId,
    operationId: string,
    activeMailbox: Mailbox,
    primaryAddress: MailAddress,
    draft: Draft,
  ): Promise<OutgoingMessage> {
    const message = this.buildMessage(activeMailbox, primaryAddress, draft);

    await this.outbox.enqueue(
      accountId,
      createOperation(operationId, accountId, outboxCommand.send(message), this.clock.now()),
    );

    return message;
  }
}
