/**
 * WBXML-1.3-Codec für EAS (Exchange ActiveSync).
 *
 * Referenz-Implementierung in TypeScript: hier wird die Byte-Korrektheit in der Node-CI
 * bewiesen (siehe wbxml.test.ts), bevor `native/ios/Wbxml.swift` als 1:1-Transkription folgt.
 *
 * WBXML-Aufbau (vereinfacht für EAS — keine Attribute, keine String-Tabelle):
 *   Header: version(1B=0x03) | publicid(mb-uint=0x01) | charset(mb-uint=0x6A UTF-8) | strTblLen(mb-uint=0)
 *   Body:   Folge aus globalen Tokens + Tag-Tokens; aktuelle Code-Page ist zustandsbehaftet.
 * Globale Tokens: SWITCH_PAGE(0x00,page) · END(0x01) · STR_I(0x03 … 0x00) · OPAQUE(0xC3,mb-uint len, bytes).
 * Tag mit Inhalt: token|0x40, danach Inhalt, dann END(0x01). Leeres Tag: token allein (kein END).
 */

import { PAGE, tagToken, type PageName } from './tokens';

export interface WbxmlNode {
  /** Code-Page-Nummer (MS-ASWBXML). */
  readonly page: number;
  /** 6-Bit-Tag-Token OHNE Flags. */
  readonly token: number;
  /** Textinhalt (STR_I). Schließt `opaque`/`children` praktisch aus (EAS kennt kein Mixed Content). */
  readonly text?: string;
  /** Binärinhalt (OPAQUE) — z. B. Anhangs-Bytes. */
  readonly opaque?: Uint8Array;
  readonly children: readonly WbxmlNode[];
}

const VERSION_1_3 = 0x03;
const PUBLICID_UNKNOWN = 0x01;
const CHARSET_UTF8 = 0x6a; // MIBenum 106
const SWITCH_PAGE = 0x00;
const END = 0x01;
const STR_I = 0x03;
const OPAQUE = 0x03 | 0xc0; // 0xC3
const CONTENT_FLAG = 0x40;

// ───────────────────────────── Multi-Byte-UInt (WBXML mb_u_int32) ─────────────────────────────

/** Kodiert eine vorzeichenlose Zahl als 7-Bit-Gruppen, big-endian, Fortsetzungsbit 0x80. */
export function encodeMbUInt(value: number): number[] {
  if (value < 0 || !Number.isInteger(value)) {
    throw new Error(`mb-uint: nur nicht-negative Ganzzahlen (${String(value)})`);
  }
  const groups: number[] = [value & 0x7f];
  let n = Math.floor(value / 0x80);
  while (n > 0) {
    groups.unshift((n & 0x7f) | 0x80);
    n = Math.floor(n / 0x80);
  }
  return groups;
}

/** Dekodiert ein mb_u_int32 ab `cursor.i`; rückt den Cursor weiter. */
export function decodeMbUInt(data: Uint8Array, cursor: { i: number }): number {
  let result = 0;
  for (;;) {
    const byte = data[cursor.i];
    if (byte === undefined) throw new Error('WBXML: abgeschnittenes mb-uint');
    cursor.i += 1;
    result = result * 0x80 + (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return result;
}

// ───────────────────────────── Node-Builder ─────────────────────────────

/** Element mit Kind-Knoten. */
export function el(page: PageName, tag: string, children: readonly WbxmlNode[] = []): WbxmlNode {
  return { page: PAGE[page], token: tagToken(page, tag), children };
}

/** Element mit Textinhalt (STR_I). */
export function txt(page: PageName, tag: string, text: string): WbxmlNode {
  return { page: PAGE[page], token: tagToken(page, tag), text, children: [] };
}

/** Element mit Binärinhalt (OPAQUE). */
export function bin(page: PageName, tag: string, opaque: Uint8Array): WbxmlNode {
  return { page: PAGE[page], token: tagToken(page, tag), opaque, children: [] };
}

// ───────────────────────────── Encoder ─────────────────────────────

export function encode(root: WbxmlNode): Uint8Array {
  const out: number[] = [VERSION_1_3];
  out.push(...encodeMbUInt(PUBLICID_UNKNOWN));
  out.push(...encodeMbUInt(CHARSET_UTF8));
  out.push(0x00); // String-Tabelle: Länge 0
  // Nach dem Header ist die aktive Code-Page 0. SWITCH_PAGE wird nur bei Wechsel emittiert.
  const state = { page: 0 };
  emit(root, out, state);
  return Uint8Array.from(out);
}

function emit(node: WbxmlNode, out: number[], state: { page: number }): void {
  if (node.page !== state.page) {
    out.push(SWITCH_PAGE, node.page);
    state.page = node.page;
  }
  const hasContent =
    node.text !== undefined || node.opaque !== undefined || node.children.length > 0;
  out.push(hasContent ? node.token | CONTENT_FLAG : node.token);
  if (!hasContent) return;

  if (node.text !== undefined) {
    out.push(STR_I);
    for (const b of utf8(node.text)) out.push(b);
    out.push(0x00);
  }
  if (node.opaque !== undefined) {
    out.push(OPAQUE);
    out.push(...encodeMbUInt(node.opaque.length));
    for (const b of node.opaque) out.push(b);
  }
  for (const child of node.children) emit(child, out, state);
  out.push(END);
}

// ───────────────────────────── Decoder ─────────────────────────────

export function decode(data: Uint8Array): WbxmlNode {
  const cursor = { i: 0 };
  if (data[cursor.i] === undefined) throw new Error('WBXML: leer');
  cursor.i += 1; // version
  decodeMbUInt(data, cursor); // publicid
  decodeMbUInt(data, cursor); // charset
  decodeMbUInt(data, cursor); // string table length (immer 0 für EAS)

  const state = { page: 0 };
  const stack: MutableNode[] = [];
  let root: MutableNode | undefined;

  while (cursor.i < data.length) {
    const byte = data[cursor.i];
    if (byte === undefined) break;
    cursor.i += 1;

    if (byte === SWITCH_PAGE) {
      const page = data[cursor.i];
      if (page === undefined) throw new Error('WBXML: SWITCH_PAGE ohne Seite');
      cursor.i += 1;
      state.page = page;
      continue;
    }
    if (byte === END) {
      stack.pop();
      continue;
    }
    if (byte === STR_I) {
      const top = stack[stack.length - 1];
      if (top === undefined) throw new Error('WBXML: STR_I ohne Element');
      top.text = (top.text ?? '') + readInlineString(data, cursor);
      continue;
    }
    if (byte === OPAQUE) {
      const top = stack[stack.length - 1];
      if (top === undefined) throw new Error('WBXML: OPAQUE ohne Element');
      const len = decodeMbUInt(data, cursor);
      top.opaque = data.slice(cursor.i, cursor.i + len);
      cursor.i += len;
      continue;
    }

    // Tag-Token
    const hasContent = (byte & CONTENT_FLAG) !== 0;
    const token = byte & 0x3f;
    const node: MutableNode = { page: state.page, token, children: [] };
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      root = node;
    } else {
      parent.children.push(node);
    }
    if (hasContent) stack.push(node);
  }

  if (root === undefined) throw new Error('WBXML: kein Wurzelelement');
  return root;
}

interface MutableNode {
  page: number;
  token: number;
  text?: string;
  opaque?: Uint8Array;
  children: MutableNode[];
}

function readInlineString(data: Uint8Array, cursor: { i: number }): string {
  const start = cursor.i;
  while (cursor.i < data.length && data[cursor.i] !== 0x00) cursor.i += 1;
  if (data[cursor.i] !== 0x00) throw new Error('WBXML: STR_I ohne NUL-Abschluss');
  const slice = data.slice(start, cursor.i);
  cursor.i += 1; // NUL überspringen
  return utf8Decode(slice);
}

// ───────────────────────────── UTF-8 ─────────────────────────────

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function utf8Decode(b: Uint8Array): string {
  return new TextDecoder('utf-8').decode(b);
}
