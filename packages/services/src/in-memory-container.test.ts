import { groupByConversation } from '@nexus/domain';
import type { Rule } from '@nexus/domain';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT, DEMO_INBOX, seedDemoData } from './demo-seed';
import { createInMemoryContainer } from './in-memory-container';

async function seededContainer() {
  const c = createInMemoryContainer();
  await seedDemoData(c);
  return c;
}

describe('createInMemoryContainer + seedDemoData (Demo-Pfad)', () => {
  it('seedet Posteingang, Ordner, Kontakte und Termine', async () => {
    const c = await seededContainer();
    const inbox = await c.mailStore.listFolder(DEMO_ACCOUNT, DEMO_INBOX, 100, 0);
    expect(inbox.length).toBeGreaterThanOrEqual(4);
    expect(await c.folders.listFolders(DEMO_ACCOUNT)).not.toHaveLength(0);
    expect(await c.contacts.search(DEMO_ACCOUNT, 'brandt')).not.toHaveLength(0);
    const agenda = await c.calendar.agenda(DEMO_ACCOUNT, 0, Number.MAX_SAFE_INTEGER);
    expect(agenda).not.toHaveLength(0);
  });

  it('gruppiert die Angebots-Konversation zu einem Thread', async () => {
    const c = await seededContainer();
    const inbox = await c.mailStore.listFolder(DEMO_ACCOUNT, DEMO_INBOX, 100, 0);
    const convo = groupByConversation(inbox).find((t) => t.conversationId === 'conv-angebot');
    expect(convo?.messages.map((m) => m.id)).toEqual(['m-100', 'm-101']);
  });

  it('findet Demo-Nachrichten über die lokale Suche', async () => {
    const c = await seededContainer();
    const hits = await c.search.search(DEMO_ACCOUNT, 'angebot', { includeServer: false });
    expect(hits.map((h) => h.messageId)).toContain('m-100');
  });

  it('wendet eine Regel auf eine Demo-Nachricht an (markRead + Kategorie)', async () => {
    const c = await seededContainer();
    const inbox = await c.mailStore.listFolder(DEMO_ACCOUNT, DEMO_INBOX, 100, 0);
    const newsletter = inbox.find((m) => m.subject.includes('Newsletter'));
    expect(newsletter).toBeDefined();

    const rule: Rule = {
      id: 'demo-newsletter',
      name: 'Newsletter',
      enabled: true,
      match: 'all',
      conditions: [{ type: 'subjectContains', value: 'newsletter' }],
      actions: [{ type: 'markRead' }, { type: 'addCategory', category: 'Newsletter' }],
    };

    if (newsletter !== undefined) {
      const result = await c.rules.process(DEMO_ACCOUNT, newsletter, [rule]);
      expect(result.matched).toBe(true);
      const updated = await c.mailStore.getMessage(DEMO_ACCOUNT, newsletter.id);
      expect(updated?.categories).toContain('Newsletter');
    }
  });
});
