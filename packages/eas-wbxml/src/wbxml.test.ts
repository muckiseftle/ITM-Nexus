import { describe, expect, it } from 'vitest';
import {
  bin,
  decode,
  decodeMbUInt,
  el,
  encode,
  encodeMbUInt,
  tagToken,
  txt,
  type WbxmlNode,
} from './index';

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');

const bytes = (...vals: number[]): Uint8Array => Uint8Array.from(vals);

describe('mb-uint', () => {
  it('kodiert kanonische Grenzwerte ([MS-WBXML])', () => {
    expect(encodeMbUInt(0)).toEqual([0x00]);
    expect(encodeMbUInt(127)).toEqual([0x7f]);
    expect(encodeMbUInt(128)).toEqual([0x81, 0x00]);
    expect(encodeMbUInt(16384)).toEqual([0x81, 0x80, 0x00]);
  });

  it('round-trippt eine Reihe von Werten', () => {
    for (const v of [0, 1, 127, 128, 300, 16383, 16384, 2097151, 2097152, 1234567]) {
      const cursor = { i: 0 };
      expect(decodeMbUInt(Uint8Array.from(encodeMbUInt(v)), cursor)).toBe(v);
    }
  });

  it('lehnt negative/nicht-ganzzahlige Werte ab', () => {
    expect(() => encodeMbUInt(-1)).toThrow();
    expect(() => encodeMbUInt(1.5)).toThrow();
  });

  it('wirft bei abgeschnittenem mb-uint', () => {
    expect(() => decodeMbUInt(bytes(0x81), { i: 0 })).toThrow();
  });
});

describe('encode — kanonische Byte-Vektoren', () => {
  it('FolderSync(SyncKey=0) ergibt die bekannten Bytes', () => {
    // <FolderSync xmlns=FolderHierarchy><SyncKey>0</SyncKey></FolderSync>
    const tree = el('FolderHierarchy', 'FolderSync', [txt('FolderHierarchy', 'SyncKey', '0')]);
    const expected = bytes(
      0x03,
      0x01,
      0x6a,
      0x00, // Header: v1.3, publicid=1, charset=UTF-8, strTbl=0
      0x00,
      0x07, //             SWITCH_PAGE 7 (FolderHierarchy)
      0x56, //                   FolderSync (0x16) + Content (0x40)
      0x52, //                   SyncKey (0x12) + Content
      0x03,
      0x30,
      0x00, //       STR_I "0"
      0x01, //                   END SyncKey
      0x01, //                   END FolderSync
    );
    expect(hex(encode(tree))).toBe(hex(expected));
  });

  it('Ping mit Heartbeat + Ordnerliste ergibt die bekannten Bytes', () => {
    const tree = el('Ping', 'Ping', [
      txt('Ping', 'HeartbeatInterval', '480'),
      el('Ping', 'Folders', [
        el('Ping', 'Folder', [txt('Ping', 'Id', '5'), txt('Ping', 'Class', 'Email')]),
      ]),
    ]);
    const expected = bytes(
      0x03,
      0x01,
      0x6a,
      0x00,
      0x00,
      0x0d, //                                   SWITCH_PAGE 13 (Ping)
      0x45, //                                         Ping (0x05)+C
      0x48,
      0x03,
      0x34,
      0x38,
      0x30,
      0x00,
      0x01, //     HeartbeatInterval "480"
      0x49, //                                         Folders (0x09)+C
      0x4a, //                                         Folder (0x0a)+C
      0x4b,
      0x03,
      0x35,
      0x00,
      0x01, //                 Id "5"
      0x4c,
      0x03,
      0x45,
      0x6d,
      0x61,
      0x69,
      0x6c,
      0x00,
      0x01, // Class "Email"
      0x01, //                                         END Folder
      0x01, //                                         END Folders
      0x01, //                                         END Ping
    );
    expect(hex(encode(tree))).toBe(hex(expected));
  });

  it('leeres Element wird ohne END kodiert', () => {
    // <GetChanges/> als alleinstehendes leeres Element (Token 0x13, kein Content-Flag, kein END)
    const tree: WbxmlNode = { page: 0, token: 0x13, children: [] };
    expect(hex(encode(tree))).toBe(hex(bytes(0x03, 0x01, 0x6a, 0x00, 0x13)));
  });
});

describe('decode', () => {
  it('dekodiert den FolderSync-Vektor in den erwarteten Baum', () => {
    const data = bytes(
      0x03,
      0x01,
      0x6a,
      0x00,
      0x00,
      0x07,
      0x56,
      0x52,
      0x03,
      0x30,
      0x00,
      0x01,
      0x01,
    );
    const root = decode(data);
    expect(root.page).toBe(7);
    expect(root.token).toBe(0x16);
    expect(root.children).toHaveLength(1);
    const child = root.children[0];
    expect(child?.page).toBe(7);
    expect(child?.token).toBe(0x12);
    expect(child?.text).toBe('0');
  });

  it('wirft bei leeren Daten / fehlender Wurzel', () => {
    expect(() => decode(bytes())).toThrow();
    expect(() => decode(bytes(0x03, 0x01, 0x6a, 0x00))).toThrow(/Wurzel/);
  });
});

describe('round-trip (Engine-Korrektheit, code-page-übergreifend)', () => {
  it('Sync mit Options/BodyPreference wechselt Code-Pages 0↔17 und zurück', () => {
    const tree = el('AirSync', 'Sync', [
      el('AirSync', 'Collections', [
        el('AirSync', 'Collection', [
          txt('AirSync', 'SyncKey', '0'),
          txt('AirSync', 'CollectionId', '5'),
          el('AirSync', 'GetChanges', []),
          el('AirSync', 'Options', [
            el('AirSyncBase', 'BodyPreference', [
              txt('AirSyncBase', 'Type', '2'),
              txt('AirSyncBase', 'TruncationSize', '32768'),
              txt('AirSyncBase', 'AllOrNone', '1'),
            ]),
          ]),
          el('AirSync', 'WindowSize', []),
        ]),
      ]),
    ]);
    expect(decode(encode(tree))).toEqual(tree);
  });

  it('round-trippt OPAQUE-Binärinhalt (Anhangs-Bytes)', () => {
    const payload = Uint8Array.from([0x00, 0x01, 0xff, 0x80, 0x7f, 0x00, 0x42]);
    const tree = el('ItemOperations', 'ItemOperations', [
      el('ItemOperations', 'Response', [
        el('ItemOperations', 'Fetch', [bin('ItemOperations', 'Data', payload)]),
      ]),
    ]);
    const decoded = decode(encode(tree));
    const data = decoded.children[0]?.children[0]?.children[0];
    expect(data?.opaque).toEqual(payload);
  });

  it('round-trippt UTF-8 mit Mehrbyte-Zeichen', () => {
    const tree = txt('Email', 'Subject', 'Grüße – Привет 😀');
    expect(decode(encode(tree)).text).toBe('Grüße – Привет 😀');
  });

  it('round-trippt eine Provision-Acknowledge-Struktur', () => {
    const tree = el('Provision', 'Provision', [
      el('Provision', 'Policies', [
        el('Provision', 'Policy', [
          txt('Provision', 'PolicyType', 'MS-EAS-Provisioning-WBXML'),
          txt('Provision', 'PolicyKey', '1234567890'),
          txt('Provision', 'Status', '1'),
        ]),
      ]),
    ]);
    expect(decode(encode(tree))).toEqual(tree);
  });
});

describe('tagToken', () => {
  it('löst bekannte Tags auf', () => {
    expect(tagToken('FolderHierarchy', 'FolderSync')).toBe(0x16);
    expect(tagToken('AirSyncBase', 'BodyPreference')).toBe(0x05);
    expect(tagToken('Provision', 'PolicyKey')).toBe(0x09);
  });

  it('wirft bei unbekanntem Tag (Tippfehler-Schutz)', () => {
    expect(() => tagToken('AirSync', 'Nope')).toThrow(/Unbekanntes EAS-Tag/);
  });
});
