// Erzeugt das NEXUS-App-Icon als echte PNGs (ohne externe Bild-Tools).
// Design: Schild (Sicherheit) mit Briefumschlag (Mail) + Blitz (Performance) auf Blau-Verlauf.
// Aufruf: node apps/nexus-mobile/assets/gen-icon.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'icon');
mkdirSync(OUT, { recursive: true });

// — Farben —
// Verlauf für Tiefe/Premium-Look: Brand-Blau → tiefes Indigo.
const TOP = [37, 99, 235]; // #2563EB
const BOT = [23, 37, 84]; // #172554
const WHITE = [255, 255, 255];
const BOLT = [14, 165, 233]; // #0EA5E9 Cyan-Akzent = Geschwindigkeit/Performance
const lerp = (a, b, p) => Math.round(a + (b - a) * p);

// Konzept: SCHILD (Sicherheit) — darin oben ein BRIEFUMSCHLAG (Mail/Kommunikation) und
// unten ein BLITZ (Performance/Geschwindigkeit). Auf Blau-Verlauf.
const CX = 0.5;
const ENVCOL = [37, 99, 235]; // Umschlag in Brand-Blau auf weißem Schild
const SHIELD = { top: 0.135, shoulder: 0.5, bottom: 0.87, halfW: 0.31, rTop: 0.07 };

// Briefumschlag (oben im Schild) — gefüllter Körper + weiße Klappe (V).
const ENV = { x0: 0.335, y0: 0.305, x1: 0.665, y1: 0.475, r: 0.022 };
const FLAP_APEX = [0.5, 0.425];
const FLAP_T = 0.013;

// Blitz (unten im Schild) — Cyan-Akzent.
const BOLT_POLY = [
  [0.55, 0.55],
  [0.435, 0.675],
  [0.508, 0.675],
  [0.452, 0.805],
  [0.588, 0.64],
  [0.508, 0.64],
];

function shieldHalfWidth(ny) {
  const s = SHIELD;
  if (ny < s.top || ny > s.bottom) return -1;
  if (ny <= s.shoulder) return s.halfW;
  const k = 1 - (ny - s.shoulder) / (s.bottom - s.shoulder);
  return s.halfW * Math.max(0, k);
}

function inShield(nx, ny) {
  const hw = shieldHalfWidth(ny);
  if (hw < 0) return false;
  const dx = Math.abs(nx - CX);
  if (ny < SHIELD.top + SHIELD.rTop && dx > SHIELD.halfW - SHIELD.rTop) {
    const ccx = CX + Math.sign(nx - CX) * (SHIELD.halfW - SHIELD.rTop);
    const ccy = SHIELD.top + SHIELD.rTop;
    return Math.hypot(nx - ccx, ny - ccy) <= SHIELD.rTop;
  }
  return dx <= hw;
}

function inRoundRect(x, y, R) {
  if (x < R.x0 || x > R.x1 || y < R.y0 || y > R.y1) return false;
  const inCx = x < R.x0 + R.r || x > R.x1 - R.r;
  const inCy = y < R.y0 + R.r || y > R.y1 - R.r;
  if (inCx && inCy) {
    const cx = Math.min(Math.max(x, R.x0 + R.r), R.x1 - R.r);
    const cy = Math.min(Math.max(y, R.y0 + R.r), R.y1 - R.r);
    return Math.hypot(x - cx, y - cy) <= R.r;
  }
  return true;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let tt = ((px - ax) * dx + (py - ay) * dy) / len2;
  tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy));
}

function onFlap(x, y) {
  return (
    distToSeg(x, y, ENV.x0 + 0.02, ENV.y0 + 0.02, FLAP_APEX[0], FLAP_APEX[1]) < FLAP_T ||
    distToSeg(x, y, ENV.x1 - 0.02, ENV.y0 + 0.02, FLAP_APEX[0], FLAP_APEX[1]) < FLAP_T
  );
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      yi = poly[i][1],
      xj = poly[j][0],
      yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function sampleAt(nx, ny) {
  const bg = [lerp(TOP[0], BOT[0], ny), lerp(TOP[1], BOT[1], ny), lerp(TOP[2], BOT[2], ny)];
  if (!inShield(nx, ny)) return bg;
  // Blitz unten (Performance).
  if (pointInPoly(nx, ny, BOLT_POLY)) return BOLT;
  // Briefumschlag oben (Mail): blauer Körper, weiße Klappe.
  if (inRoundRect(nx, ny, ENV)) return onFlap(nx, ny) ? WHITE : ENVCOL;
  // Sonst weißes Schild (Sicherheit).
  return WHITE;
}

function renderIcon(size) {
  const ss = 2; // Supersampling
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = (x + (sx + 0.5) / ss) / size;
          const ny = (y + (sy + 0.5) / ss) / size;
          const c = sampleAt(nx, ny);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(r / n);
      buf[i + 1] = Math.round(g / n);
      buf[i + 2] = Math.round(b / n);
      buf[i + 3] = 255; // App-Icons sind opak
    }
  }
  return buf;
}

// — PNG-Encoder (RGBA, Filter 0) —
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // Filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizes = [1024, 192, 144, 96, 72, 48];
for (const size of sizes) {
  const png = encodePNG(renderIcon(size), size);
  writeFileSync(join(OUT, `icon-${size}.png`), png);
  console.log(`icon-${size}.png (${png.length} B)`);
}
console.log('Done →', OUT);
