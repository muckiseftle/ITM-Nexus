// Bereitet das NEXUS-App-Icon aus der Vorlage `icon-src.png` auf (ohne externe Bild-Tools):
// dekodiert das PNG, beschneidet weißen Rand + runde Ecken (iOS rundet selbst) → vollflächige,
// ALPHA-FREIE Icons (App-Store-konform) in den benötigten Größen.
// Aufruf: node apps/nexus-mobile/assets/gen-icon.mjs
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, 'icon');
mkdirSync(OUT, { recursive: true });

// — PNG-Decoder (8-bit, RGB/RGBA) —
function decodePNG(buf) {
  let p = 8;
  let w = 0,
    h = 0,
    colorType = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : 3; // RGBA oder RGB
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 3); // immer RGB ausgeben
  const prev = Buffer.alloc(stride);
  let cur = Buffer.alloc(stride);
  const paeth = (a, b, c) => {
    const pp = a + b - c;
    const pa = Math.abs(pp - a),
      pb = Math.abs(pp - b),
      pc = Math.abs(pp - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    for (let i = 0; i < stride; i++) {
      const x = raw[rp++];
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = x;
      if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) v = x + paeth(a, b, c);
      cur[i] = v & 0xff;
    }
    for (let xx = 0; xx < w; xx++) {
      out[(y * w + xx) * 3] = cur[xx * ch];
      out[(y * w + xx) * 3 + 1] = cur[xx * ch + 1];
      out[(y * w + xx) * 3 + 2] = cur[xx * ch + 2];
    }
    cur.copy(prev);
  }
  return { w, h, rgb: out };
}

const isWhite = (r, g, b) => r > 232 && g > 232 && b > 232;

// — Quelle laden + Inhalts-Bounding-Box (ohne weißen Rand) —
const src = decodePNG(readFileSync(join(DIR, 'icon-src.png')));
let x0 = src.w,
  y0 = src.h,
  x1 = 0,
  y1 = 0;
for (let y = 0; y < src.h; y++) {
  for (let x = 0; x < src.w; x++) {
    const i = (y * src.w + x) * 3;
    if (!isWhite(src.rgb[i], src.rgb[i + 1], src.rgb[i + 2])) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}
// Hintergrund-Navy aus einem Pixel knapp innerhalb der oberen Kante (mittig) ableiten.
const navyIdx = ((y0 + 8) * src.w + ((x0 + x1) >> 1)) * 3;
const NAVY = [src.rgb[navyIdx], src.rgb[navyIdx + 1], src.rgb[navyIdx + 2]];
const bw = x1 - x0 + 1;
const bh = y1 - y0 + 1;

function bilinear(fx, fy) {
  const ix = Math.min(src.w - 1, Math.max(0, Math.floor(fx)));
  const iy = Math.min(src.h - 1, Math.max(0, Math.floor(fy)));
  const i = (iy * src.w + ix) * 3;
  return [src.rgb[i], src.rgb[i + 1], src.rgb[i + 2]];
}

// Bounding-Box leicht beschneiden (Anti-Aliasing-Kante der Vorlage weg → randlos navy).
const inset = Math.round(Math.min(bw, bh) * 0.022);
const ix0 = x0 + inset,
  iy0 = y0 + inset,
  iw = bw - 2 * inset,
  ih = bh - 2 * inset;

function render(size) {
  const buf = Buffer.alloc(size * size * 3);
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      const fx = ix0 + ((ox + 0.5) / size) * iw;
      const fy = iy0 + ((oy + 0.5) / size) * ih;
      const c = bilinear(fx, fy);
      const i = (oy * size + ox) * 3;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
    }
  }
  // Runde Ecken/Restränder entfernen: weiße Pixel von den 4 Ecken her bis zur Navy-Kante
  // mit Navy fluten (Artwork-Weiß im Inneren bleibt unberührt).
  floodCornersToNavy(buf, size);
  return buf;
}

function floodCornersToNavy(buf, size) {
  const seen = new Uint8Array(size * size);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const k = y * size + x;
    if (seen[k]) return;
    seen[k] = 1;
    const i = k * 3;
    if (isWhite(buf[i], buf[i + 1], buf[i + 2])) {
      buf[i] = NAVY[0];
      buf[i + 1] = NAVY[1];
      buf[i + 2] = NAVY[2];
      stack.push(k);
    }
  };
  for (const [cx, cy] of [
    [0, 0],
    [size - 1, 0],
    [0, size - 1],
    [size - 1, size - 1],
  ])
    push(cx, cy);
  while (stack.length) {
    const k = stack.pop();
    const x = k % size,
      y = (k / size) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

// — PNG-Encoder (RGB, colorType 2 — ohne Alpha) —
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
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
function encodePNG(rgb, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [1024, 192, 144, 96, 72, 48]) {
  const png = encodePNG(render(size), size);
  writeFileSync(join(OUT, `icon-${size}.png`), png);
  console.log(`icon-${size}.png (${png.length} B)`);
}
console.log(`Navy=${NAVY}, bbox=${x0},${y0}..${x1},${y1} → ${OUT}`);
