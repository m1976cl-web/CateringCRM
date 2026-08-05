/**
 * Writes solid-color PNGs with a simple plate glyph for PWA icons.
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function rgba(r, g, b, a = 255) {
  return [r, g, b, a];
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const bg = rgba(31, 107, 74);
  const fg = rgba(244, 232, 200);

  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = color[3];
  };

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  const corner = size * 0.18;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inCorner =
        (x < corner && y < corner && (x - corner) ** 2 + (y - corner) ** 2 > corner ** 2) ||
        (x > size - 1 - corner &&
          y < corner &&
          (x - (size - 1 - corner)) ** 2 + (y - corner) ** 2 > corner ** 2) ||
        (x < corner &&
          y > size - 1 - corner &&
          (x - corner) ** 2 + (y - (size - 1 - corner)) ** 2 > corner ** 2) ||
        (x > size - 1 - corner &&
          y > size - 1 - corner &&
          (x - (size - 1 - corner)) ** 2 + (y - (size - 1 - corner)) ** 2 > corner ** 2);
      if (inCorner) {
        set(x, y, rgba(0, 0, 0, 0));
      } else {
        set(x, y, bg);
      }
    }
  }

  // Dome / plate arc
  const arcY = cy + size * 0.08;
  const arcR = size * 0.28;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - arcY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > arcR - size * 0.035 && d < arcR + size * 0.035 && dy < size * 0.02) {
        set(x, y, fg);
      }
      // knob
      if (Math.sqrt(dx * dx + (y - (arcY - arcR)) ** 2) < size * 0.045) {
        set(x, y, fg);
      }
    }
  }

  // maskable safe padding hint: keep content inside ~80%
  void radius;

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, createIcon(size));
  console.log("wrote", file);
}
