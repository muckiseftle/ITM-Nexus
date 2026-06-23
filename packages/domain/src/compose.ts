import { BodyType } from './enums';
import type { MessageId } from './ids';
import { mailAddressEquals } from './mail-address';
import type { MailAddress, MailMessage, Recipient, RecipientKind } from './models';

/** Art der vorbelegten Antwort: einfache Antwort, an alle, oder Weiterleitung. */
export type ReplyMode = 'reply' | 'replyAll' | 'forward';

/** Vorbelegung für den Composer (aus einer bestehenden Nachricht abgeleitet). */
export interface ComposePrefill {
  readonly to: readonly MailAddress[];
  readonly cc: readonly MailAddress[];
  readonly subject: string;
  readonly body: string;
  /** Bezug zur Ursprungsnachricht (nur bei Antworten, nicht bei Weiterleitung). */
  readonly inReplyTo?: MessageId;
}

const RE_PREFIX = /^(re|aw)\s*:/i;
const FWD_PREFIX = /^(fwd|fw|wg)\s*:/i;

/** Betreff für eine Antwort (verhindert doppelte „Re:"/„Aw:"-Präfixe). */
export function replySubject(subject: string): string {
  const s = subject.trim();
  return RE_PREFIX.test(s) ? s : `Re: ${s}`;
}

/** Betreff für eine Weiterleitung (verhindert doppelte „Fwd:"/„Wg:"-Präfixe). */
export function forwardSubject(subject: string): string {
  const s = subject.trim();
  return FWD_PREFIX.test(s) ? s : `Fwd: ${s}`;
}

/**
 * Sehr einfache HTML→Text-Reduktion (ohne WebView-Abhängigkeit). Bewusst konservativ:
 * Block-Elemente werden zu Zeilenumbrüchen, Tags entfernt, gängige Entities aufgelöst.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Liefert den Nachrichtentext als Klartext (HTML wird reduziert, sonst Preview). */
export function messageBodyToText(message: MailMessage): string {
  const content = message.body?.content ?? message.preview;
  return message.body?.type === BodyType.Html ? htmlToPlainText(content) : content;
}

/** Formatiert eine Adresse als `Name <adresse>` bzw. nur `adresse`. */
export function formatAddress(a: MailAddress): string {
  return a.displayName !== undefined && a.displayName.length > 0
    ? `${a.displayName} <${a.address}>`
    : a.address;
}

/** Formatiert eine Adressliste komma-separiert (für Eingabefelder/Header). */
export function formatAddressList(list: readonly MailAddress[]): string {
  return list.map(formatAddress).join(', ');
}

const ADDR_WITH_NAME = /^(.*?)<([^>]+)>$/;

function parseOneAddress(token: string): MailAddress {
  const m = ADDR_WITH_NAME.exec(token);
  if (m !== null) {
    const name = (m[1] ?? '').trim();
    const address = (m[2] ?? '').trim();
    return name.length > 0 ? { address, displayName: name } : { address };
  }
  return { address: token };
}

/**
 * Zerlegt eine durch Komma/Semikolon getrennte Eingabe in Adressen. Akzeptiert
 * `Name <adresse>` und nackte `adresse`-Token; leere Token werden verworfen.
 * Validiert NICHT — die Syntaxprüfung erfolgt beim Erstellen der Empfänger.
 */
export function parseAddressList(text: string): MailAddress[] {
  return text
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(parseOneAddress);
}

/** Wie {@link parseAddressList}, liefert aber typisierte Empfänger. */
export function parseRecipients(text: string, kind: RecipientKind): Recipient[] {
  return parseAddressList(text).map((address) => ({ kind, address }));
}

function dedupeExcluding(
  list: readonly MailAddress[],
  exclude: readonly MailAddress[],
): MailAddress[] {
  const out: MailAddress[] = [];
  for (const a of list) {
    if (exclude.some((e) => mailAddressEquals(e, a))) continue;
    if (out.some((o) => mailAddressEquals(o, a))) continue;
    out.push(a);
  }
  return out;
}

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${String(d.getFullYear())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function quoteForReply(message: MailMessage): string {
  const text = messageBodyToText(message);
  const when = formatDateTime(message.sentAt ?? message.receivedAt);
  const attribution = `Am ${when} schrieb ${formatAddress(message.from)}:`;
  const quoted = text
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
  return `\n\n${attribution}\n${quoted}\n`;
}

function forwardBody(message: MailMessage): string {
  const toList = formatAddressList(
    message.recipients.filter((r) => r.kind === 'to').map((r) => r.address),
  );
  return [
    '',
    '',
    '---------- Weitergeleitete Nachricht ----------',
    `Von: ${formatAddress(message.from)}`,
    `Datum: ${formatDateTime(message.sentAt ?? message.receivedAt)}`,
    `Betreff: ${message.subject}`,
    `An: ${toList}`,
    '',
    messageBodyToText(message),
  ].join('\n');
}

/**
 * Leitet die Composer-Vorbelegung aus einer bestehenden Nachricht ab:
 * - `reply`: To = Absender; zitierter Text.
 * - `replyAll`: To = Absender + ursprüngliche To-Empfänger; Cc = ursprüngliche Cc; eigene
 *   Adresse wird entfernt; Duplikate werden zusammengeführt.
 * - `forward`: keine Empfänger; eingebetteter Weiterleitungs-Header + Originaltext.
 */
export function buildComposePrefill(
  message: MailMessage,
  mode: ReplyMode,
  self: MailAddress,
): ComposePrefill {
  if (mode === 'forward') {
    return {
      to: [],
      cc: [],
      subject: forwardSubject(message.subject),
      body: forwardBody(message),
    };
  }

  const to: MailAddress[] = [message.from];
  const cc: MailAddress[] = [];
  if (mode === 'replyAll') {
    for (const r of message.recipients) {
      if (r.kind === 'to') to.push(r.address);
      else if (r.kind === 'cc') cc.push(r.address);
    }
  }
  const dedupedTo = dedupeExcluding(to, [self]);
  const dedupedCc = dedupeExcluding(cc, [self, ...dedupedTo]);

  return {
    to: dedupedTo,
    cc: dedupedCc,
    subject: replySubject(message.subject),
    body: quoteForReply(message),
    inReplyTo: message.id,
  };
}
