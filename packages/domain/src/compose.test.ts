import { describe, expect, it } from 'vitest';
import { BodyType } from './enums';
import { toAccountId, toFolderId, toMessageId } from './ids';
import type { MailMessage, Recipient } from './models';
import {
  buildComposePrefill,
  formatAddress,
  formatAddressList,
  forwardSubject,
  htmlToPlainText,
  messageBodyToText,
  parseAddressList,
  parseRecipients,
  replySubject,
} from './compose';

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: toMessageId('m1'),
    accountId: toAccountId('acc-1'),
    folderId: toFolderId('inbox'),
    subject: 'Quartalszahlen',
    from: { address: 'chef@firma.de', displayName: 'Der Chef' },
    recipients: [
      { kind: 'to', address: { address: 'me@firma.de' } },
      { kind: 'to', address: { address: 'kollege@firma.de', displayName: 'Kollege K' } },
      { kind: 'cc', address: { address: 'cc1@firma.de' } },
    ],
    receivedAt: Date.UTC(2026, 5, 23, 10, 30),
    sentAt: Date.UTC(2026, 5, 23, 10, 30),
    importance: 'normal',
    flags: [],
    categories: [],
    hasAttachments: false,
    attachments: [],
    preview: 'Kurzfassung',
    body: { type: BodyType.Text, content: 'Zeile eins\nZeile zwei' },
    ...overrides,
  };
}

const self = { address: 'me@firma.de' };

describe('Betreff-Präfixe', () => {
  it('fügt Re:/Fwd: hinzu, vermeidet aber Dopplungen', () => {
    expect(replySubject('Hallo')).toBe('Re: Hallo');
    expect(replySubject('Re: Hallo')).toBe('Re: Hallo');
    expect(replySubject('AW: Hallo')).toBe('AW: Hallo');
    expect(forwardSubject('Hallo')).toBe('Fwd: Hallo');
    expect(forwardSubject('Fwd: Hallo')).toBe('Fwd: Hallo');
    expect(forwardSubject('WG: Hallo')).toBe('WG: Hallo');
  });
});

describe('Adress-Formatierung & -Parsing', () => {
  it('formatiert mit und ohne Anzeigenamen', () => {
    expect(formatAddress({ address: 'a@b.de' })).toBe('a@b.de');
    expect(formatAddress({ address: 'a@b.de', displayName: 'Anna' })).toBe('Anna <a@b.de>');
    expect(formatAddressList([{ address: 'a@b.de' }, { address: 'c@d.de' }])).toBe(
      'a@b.de, c@d.de',
    );
  });

  it('zerlegt Komma-/Semikolon-Listen inkl. „Name <adresse>"', () => {
    expect(parseAddressList('a@b.de, Anna <anna@b.de>; c@d.de')).toEqual([
      { address: 'a@b.de' },
      { address: 'anna@b.de', displayName: 'Anna' },
      { address: 'c@d.de' },
    ]);
    expect(parseAddressList('   ')).toEqual([]);
  });

  it('parseRecipients setzt die Empfänger-Art', () => {
    const r: Recipient[] = parseRecipients('a@b.de, c@d.de', 'cc');
    expect(r).toEqual([
      { kind: 'cc', address: { address: 'a@b.de' } },
      { kind: 'cc', address: { address: 'c@d.de' } },
    ]);
  });
});

describe('htmlToPlainText / messageBodyToText', () => {
  it('reduziert HTML zu Text', () => {
    expect(htmlToPlainText('<p>Hallo</p><b>Welt</b> &amp; mehr')).toBe('Hallo\nWelt & mehr');
    expect(htmlToPlainText('<p>Hallo</p><br/><b>Welt</b>')).toBe('Hallo\n\nWelt');
  });
  it('nutzt HTML-Reduktion nur bei HTML-Body', () => {
    expect(
      messageBodyToText(message({ body: { type: BodyType.Html, content: '<p>Hi</p>' } })),
    ).toBe('Hi');
    expect(messageBodyToText(message({ body: { type: BodyType.Text, content: 'Plain' } }))).toBe(
      'Plain',
    );
  });
});

describe('buildComposePrefill', () => {
  it('reply: nur an den Absender, mit Zitat und inReplyTo', () => {
    const p = buildComposePrefill(message(), 'reply', self);
    expect(p.to).toEqual([{ address: 'chef@firma.de', displayName: 'Der Chef' }]);
    expect(p.cc).toEqual([]);
    expect(p.subject).toBe('Re: Quartalszahlen');
    expect(p.inReplyTo).toBe(toMessageId('m1'));
    expect(p.body).toContain('> Zeile eins');
    expect(p.body).toContain('schrieb Der Chef <chef@firma.de>:');
  });

  it('replyAll: Absender + To-Empfänger, Cc übernommen, eigene Adresse entfernt', () => {
    const p = buildComposePrefill(message(), 'replyAll', self);
    expect(p.to.map((a) => a.address)).toEqual(['chef@firma.de', 'kollege@firma.de']);
    expect(p.to.map((a) => a.address)).not.toContain('me@firma.de');
    expect(p.cc.map((a) => a.address)).toEqual(['cc1@firma.de']);
    expect(p.inReplyTo).toBe(toMessageId('m1'));
  });

  it('replyAll: dedupliziert Cc gegen To und eigene Adresse', () => {
    const m = message({
      recipients: [
        { kind: 'to', address: { address: 'kollege@firma.de' } },
        { kind: 'cc', address: { address: 'kollege@firma.de' } },
        { kind: 'cc', address: { address: 'me@firma.de' } },
      ],
    });
    const p = buildComposePrefill(m, 'replyAll', self);
    expect(p.to.map((a) => a.address)).toEqual(['chef@firma.de', 'kollege@firma.de']);
    expect(p.cc).toEqual([]);
  });

  it('forward: keine Empfänger, kein inReplyTo, eingebetteter Header', () => {
    const p = buildComposePrefill(message(), 'forward', self);
    expect(p.to).toEqual([]);
    expect(p.cc).toEqual([]);
    expect(p.subject).toBe('Fwd: Quartalszahlen');
    expect(p.inReplyTo).toBeUndefined();
    expect(p.body).toContain('Weitergeleitete Nachricht');
    expect(p.body).toContain('Von: Der Chef <chef@firma.de>');
    expect(p.body).toContain('Betreff: Quartalszahlen');
  });
});
