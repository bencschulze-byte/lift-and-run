// Generates the app icons with no dependencies: a barbell on the app's dark
// background, written out as PNG by hand (node:zlib does the compression).
//
//   node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));

const BG = [0x0e, 0x11, 0x16];
const BAR = [0x4e, 0xa1, 0xff];
const PLATE = [0xe8, 0xec, 0xf1];

// The barbell, in fractions of the canvas: [x0, y0, x1, y1, colour].
const SHAPES = [
  [0.14, 0.475, 0.86, 0.525, BAR], // bar
  [0.16, 0.34, 0.235, 0.66, PLATE], // outer plate, left
  [0.765, 0.34, 0.84, 0.66, PLATE], // outer plate, right
  [0.25, 0.39, 0.31, 0.61, BAR], // inner plate, left
  [0.69, 0.39, 0.75, 0.61, BAR], // inner plate, right
];


function renderIcon(size) {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      put(px, size, x, y, BG, 255);
    }
  }
  for (const [x0, y0, x1, y1, colour] of SHAPES) {
    fillRounded(px, size, x0 * size, y0 * size, x1 * size, y1 * size, colour);
  }
  return encodePNG(size, size, px);
}

function put(px, size, x, y, [r, g, b], a) {
  const i = (y * size + x) * 4;
  const alpha = a / 255;
  px[i] = Math.round(px[i] * (1 - alpha) + r * alpha);
  px[i + 1] = Math.round(px[i + 1] * (1 - alpha) + g * alpha);
  px[i + 2] = Math.round(px[i + 2] * (1 - alpha) + b * alpha);
  px[i + 3] = 255;
}

// Rounded rectangle with a cheap 4x supersampled edge, so the icon does not
// look like it was drawn in 1994.
function fillRounded(px, size, x0, y0, x1, y1, colour) {
  const radius = Math.min(x1 - x0, y1 - y0) * 0.35;
  for (let y = Math.floor(y0) - 1; y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0) - 1; x <= Math.ceil(x1); x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      let hits = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4, x0, y0, x1, y1, radius)) hits++;
        }
      }
      if (hits) put(px, size, x, y, colour, Math.round((hits / 16) * 255));
    }
  }
}

function inside(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r + 1e-9;
}

// --- a minimal PNG encoder ------------------------------------------------

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Run last: the tables below have to be initialised first.
function main() {
  mkdirSync(OUT, { recursive: true });
  for (const size of [192, 512, 180]) {
    const name = size === 180 ? 'apple-touch-icon-180.png' : `icon-${size}.png`;
    writeFileSync(new URL(name, `file://${OUT}`), renderIcon(size));
    console.log(`icons/${name}`);
  }
}

main();
