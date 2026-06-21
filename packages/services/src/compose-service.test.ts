import { BodyType, createMailAddress, toAccountId } from '@nexus/domain';
import type { Mailbox } from '@nexus/domain';
import { describe, expect, it } from 'vitest';
import { ComposeService } from './compose-service';
import type { Draft } from './compose-service';
import { InMemoryMailStore } from './in-memory-store';
import { OutboxProcessor } from './outbox-processor';
import { FakeMailTransport, ManualClock } from './testing/fakes';

const account = toAccountId('acc-1');
const primary = createMailAddress('assistenz@example.com');
const bossAddress = createMailAddress('vorstand@example.com');

const draft: Draft = {
  subject: 'Quartalsbericht',
  body: { type: BodyType.Text, content: 'Anbei der Bericht.' },
  recipients: [{ kind: 'to', address: createMailAddress('kunde@example.com') }],
};

function harness() {
  const store = new InMemoryMailStore();
  const transport = new FakeMailTransport();
  const clock = new ManualClock(0);
  const outbox = new OutboxProcessor(transport, store, clock);
  const compose = new ComposeService(outbox, clock);
  return { transport, outbox, compose };
}

describe('ComposeService', () => {
  it('sendet aus dem Primärpostfach (from = Primäradresse) über die Outbox', async () => {
    const { transport, outbox, compose } = harness();
    const primaryMailbox: Mailbox = {
      id: 'me',
      kind: 'primary',
      address: primary,
      displayName: 'Ich',
      permissions: [],
    };

    const message = await compose.send(account, 'op-1', primaryMailbox, primary, draft);
    expect(message.from.address).toBe('assistenz@example.com');
    expect(message.sender).toBeUndefined();

    const summary = await outbox.drain(account);
    expect(summary.succeeded).toBe(1);

    const applied = transport.appliedOps[0];
    expect(applied?.command.type).toBe('send');
    if (applied?.command.type === 'send') {
      expect(applied.command.message.subject).toBe('Quartalsbericht');
    }
  });

  it('sendet „im Auftrag von" (SendOnBehalf): from = Postfach, sender = Primäradresse', async () => {
    const { compose } = harness();
    const delegated: Mailbox = {
      id: 'boss',
      kind: 'delegated',
      address: bossAddress,
      displayName: 'Vorstand',
      permissions: ['sendOnBehalf'],
    };

    const message = await compose.send(account, 'op-2', delegated, primary, draft);
    expect(message.from.address).toBe('vorstand@example.com');
    expect(message.sender?.address).toBe('assistenz@example.com');
  });

  it('ist idempotent über die operationId', async () => {
    const { outbox, compose } = harness();
    const primaryMailbox: Mailbox = {
      id: 'me',
      kind: 'primary',
      address: primary,
      displayName: 'Ich',
      permissions: [],
    };

    await compose.send(account, 'dup', primaryMailbox, primary, draft);
    await compose.send(account, 'dup', primaryMailbox, primary, draft);
    expect((await outbox.drain(account)).processed).toBe(1);
  });
});
