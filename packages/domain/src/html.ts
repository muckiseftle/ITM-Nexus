/**
 * Sehr schlanke, sichere HTML→Block-Reduktion für die Mail-Anzeige — OHNE WebView und ohne
 * externe Abhängigkeit. Ziel: gängige E-Mail-Formatierung (Absätze, Überschriften, Fett/Kursiv/
 * Unterstrichen, Links, Listen, Zitate, Bilder, Trennlinien) strukturiert darzustellen.
 *
 * Sicherheit (NEXUS-Prinzip „kein Tracking"): `<script>`/`<style>`/`<head>`/Kommentare werden
 * entfernt, es wird KEIN HTML/JS ausgeführt und KEIN externer Inhalt geladen. Bilder werden nur
 * als Blöcke beschrieben (remote = true bei http(s)); ob ein externes Bild tatsächlich geladen
 * wird, entscheidet die UI auf ausdrückliche Nutzeraktion (Anti-Tracking).
 */

export interface HtmlSpan {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly href?: string;
}

export type HtmlBlock =
  | { readonly kind: 'paragraph'; readonly spans: readonly HtmlSpan[] }
  | { readonly kind: 'heading'; readonly level: number; readonly spans: readonly HtmlSpan[] }
  | {
      readonly kind: 'listItem';
      readonly ordered: boolean;
      readonly marker: string;
      readonly depth: number;
      readonly spans: readonly HtmlSpan[];
    }
  | { readonly kind: 'quote'; readonly spans: readonly HtmlSpan[] }
  | { readonly kind: 'image'; readonly alt: string; readonly src: string; readonly remote: boolean }
  | { readonly kind: 'rule' };

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  bull: '•',
  euro: '€',
  pound: '£',
};

function fromCodePointSafe(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Löst benannte und numerische HTML-Entities auf (defensiv — unbekannte bleiben unverändert). */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (full, bodyRaw: string) => {
    const body = bodyRaw;
    if (body.charCodeAt(0) === 35) {
      // '#'
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return fromCodePointSafe(code);
      return full;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? full;
  });
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(tag);
  if (m === null) return undefined;
  return m[2] ?? m[3] ?? m[4];
}

/** Entfernt führende/abschließende reine Leerraum-Spans und trimmt die Ränder. */
function trimSpans(spans: readonly HtmlSpan[]): HtmlSpan[] {
  const out = spans.filter((sp) => sp.text.length > 0);
  const isBlank = (sp: HtmlSpan | undefined): boolean => {
    if (sp === undefined) return false;
    return sp.text.trim() === '' && sp.text !== '\n';
  };
  while (isBlank(out[0])) out.shift();
  while (isBlank(out[out.length - 1])) out.pop();
  return out;
}

/**
 * Parst HTML in eine flache Liste darstellbarer Blöcke. Robust gegen unvollständiges Markup;
 * begrenzt die Eingabegröße, um pathologische Eingaben abzufangen.
 */
export function parseHtmlBlocks(html: string): HtmlBlock[] {
  const cleaned = (html.length > 2_000_000 ? html.slice(0, 2_000_000) : html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '');

  const blocks: HtmlBlock[] = [];
  let spans: HtmlSpan[] = [];
  let bold = 0;
  let italic = 0;
  let underline = 0;
  let href: string | undefined;
  let blockKind: 'paragraph' | 'heading' | 'quote' | 'listItem' = 'paragraph';
  let headingLevel = 2;
  const listStack: { ordered: boolean; count: number }[] = [];

  const flush = (): void => {
    const trimmed = trimSpans(spans);
    spans = [];
    if (trimmed.length === 0) return;
    if (blockKind === 'listItem' && listStack.length > 0) {
      const top = listStack[listStack.length - 1];
      const ordered = top?.ordered ?? false;
      const count = top?.count ?? 0;
      blocks.push({
        kind: 'listItem',
        ordered,
        marker: ordered ? `${String(count)}.` : '•',
        depth: listStack.length - 1,
        spans: trimmed,
      });
    } else if (blockKind === 'heading') {
      blocks.push({ kind: 'heading', level: headingLevel, spans: trimmed });
    } else if (blockKind === 'quote') {
      blocks.push({ kind: 'quote', spans: trimmed });
    } else {
      blocks.push({ kind: 'paragraph', spans: trimmed });
    }
  };

  const pushText = (raw: string): void => {
    const text = decodeHtmlEntities(raw).replace(/\s+/g, ' ');
    if (text.length === 0) return;
    spans.push({
      text,
      ...(bold > 0 ? { bold: true } : {}),
      ...(italic > 0 ? { italic: true } : {}),
      ...(underline > 0 ? { underline: true } : {}),
      ...(href !== undefined ? { href } : {}),
    });
  };

  const re = /<[^>]+>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const tok = m[0];
    if (tok.charCodeAt(0) !== 60) {
      // kein '<' → Textlauf
      pushText(tok);
      continue;
    }
    const isClose = /^<\s*\//.test(tok);
    const nameMatch = /^<\s*\/?\s*([a-zA-Z0-9]+)/.exec(tok);
    const name = nameMatch !== null ? (nameMatch[1] ?? '').toLowerCase() : '';

    switch (name) {
      case 'br':
        spans.push({ text: '\n' });
        break;
      case 'b':
      case 'strong':
        bold += isClose ? (bold > 0 ? -1 : 0) : 1;
        break;
      case 'i':
      case 'em':
        italic += isClose ? (italic > 0 ? -1 : 0) : 1;
        break;
      case 'u':
        underline += isClose ? (underline > 0 ? -1 : 0) : 1;
        break;
      case 'a':
        if (isClose) href = undefined;
        else {
          const target = attr(tok, 'href');
          href = target !== undefined ? decodeHtmlEntities(target) : undefined;
        }
        break;
      case 'p':
      case 'div':
      case 'tr':
      case 'table':
        flush();
        if (!isClose) {
          blockKind = listStack.length > 0 ? 'listItem' : 'paragraph';
        }
        break;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        flush();
        if (isClose) {
          blockKind = 'paragraph';
        } else {
          blockKind = 'heading';
          headingLevel = Number(name[1]);
        }
        break;
      case 'blockquote':
        flush();
        blockKind = isClose ? 'paragraph' : 'quote';
        break;
      case 'ul':
      case 'ol':
        flush();
        if (isClose) {
          listStack.pop();
          blockKind = listStack.length > 0 ? 'listItem' : 'paragraph';
        } else {
          listStack.push({ ordered: name === 'ol', count: 0 });
          blockKind = 'listItem';
        }
        break;
      case 'li':
        flush();
        if (!isClose && listStack.length > 0) {
          const top = listStack[listStack.length - 1];
          if (top !== undefined) top.count += 1;
          blockKind = 'listItem';
        }
        break;
      case 'hr':
        flush();
        blocks.push({ kind: 'rule' });
        break;
      case 'img': {
        flush();
        const src = attr(tok, 'src');
        if (src !== undefined && src.length > 0) {
          const decoded = decodeHtmlEntities(src);
          blocks.push({
            kind: 'image',
            alt: decodeHtmlEntities(attr(tok, 'alt') ?? ''),
            src: decoded,
            remote: /^https?:/i.test(decoded),
          });
        }
        break;
      }
      default:
        // Unbekannte/inline-neutrale Tags (span, font, table-Zellen …) ignorieren.
        break;
    }
  }
  flush();
  return blocks;
}
