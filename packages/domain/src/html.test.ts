import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities, parseHtmlBlocks, type HtmlBlock } from './html';

function paragraphs(blocks: readonly HtmlBlock[]): string[] {
  return blocks
    .filter((b) => b.kind === 'paragraph' || b.kind === 'heading' || b.kind === 'listItem')
    .map((b) => ('spans' in b ? b.spans.map((sp) => sp.text).join('') : ''));
}

describe('decodeHtmlEntities', () => {
  it('löst benannte und numerische Entities auf', () => {
    expect(decodeHtmlEntities('a &amp; b &lt;c&gt; &#39;x&#39; &#x20AC;')).toBe("a & b <c> 'x' €");
  });
  it('lässt unbekannte Entities unverändert', () => {
    expect(decodeHtmlEntities('&unknownentity;')).toBe('&unknownentity;');
  });
});

describe('parseHtmlBlocks', () => {
  it('entfernt script/style/Kommentare und rendert keinen davon', () => {
    const blocks = parseHtmlBlocks(
      '<style>.x{color:red}</style><!--secret--><script>alert(1)</script><p>Hallo</p>',
    );
    const text = paragraphs(blocks).join('\n');
    expect(text).toBe('Hallo');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color');
  });

  it('trennt Absätze und erkennt Überschriften', () => {
    const blocks = parseHtmlBlocks('<h1>Titel</h1><p>Erster</p><p>Zweiter</p>');
    const heading = blocks.find((b) => b.kind === 'heading');
    expect(heading).toBeDefined();
    expect(paragraphs(blocks)).toEqual(['Titel', 'Erster', 'Zweiter']);
  });

  it('übernimmt Inline-Formatierung (fett/kursiv) und Links', () => {
    const blocks = parseHtmlBlocks('<p>Hallo <b>Welt</b> <a href="https://x.de">Link</a></p>');
    const p = blocks.find((b) => b.kind === 'paragraph');
    expect(p?.kind).toBe('paragraph');
    if (p?.kind !== 'paragraph') throw new Error('kein Absatz');
    expect(p.spans.some((sp) => sp.bold === true && sp.text === 'Welt')).toBe(true);
    expect(p.spans.some((sp) => sp.href === 'https://x.de' && sp.text === 'Link')).toBe(true);
  });

  it('nummeriert geordnete Listen und markiert ungeordnete', () => {
    const ul = parseHtmlBlocks('<ul><li>A</li><li>B</li></ul>').filter(
      (b) => b.kind === 'listItem',
    );
    expect(ul.map((b) => b.marker)).toEqual(['•', '•']);
    const ol = parseHtmlBlocks('<ol><li>A</li><li>B</li></ol>').filter(
      (b) => b.kind === 'listItem',
    );
    expect(ol.map((b) => b.marker)).toEqual(['1.', '2.']);
  });

  it('markiert externe Bilder als remote (Anti-Tracking)', () => {
    const blocks = parseHtmlBlocks(
      '<p>x</p><img src="https://track.er/p.gif" alt="pix"><img src="cid:logo">',
    );
    const imgs = blocks.filter((b) => b.kind === 'image');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toMatchObject({ remote: true, alt: 'pix' });
    expect(imgs[1]).toMatchObject({ remote: false });
  });

  it('wandelt <br> in Zeilenumbrüche innerhalb eines Absatzes', () => {
    const blocks = parseHtmlBlocks('<p>Zeile1<br>Zeile2</p>');
    const p = blocks.find((b) => b.kind === 'paragraph');
    if (p?.kind !== 'paragraph') throw new Error('kein Absatz');
    expect(p.spans.map((sp) => sp.text).join('')).toBe('Zeile1\nZeile2');
  });
});
