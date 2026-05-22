// Generate favicon PNG files without external dependencies
// Creates proper PNG headers and pixel data manually

import { createWriteStream, writeFileSync } from "fs";
import zlib from "zlib";

function writePng(filename, width, height, pixels) {
  // pixels: Uint8Array of RGBA (width*height*4 bytes)
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xffffffff;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeBuf = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB (no alpha)
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Build raw scanlines (filter byte + RGB per pixel)
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter byte None
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      raw.push(pixels[idx], pixels[idx+1], pixels[idx+2]); // skip alpha
    }
  }
  const rawBuf = Buffer.from(raw);
  const compressed = zlib.deflateSync(rawBuf, { level: 9 });

  const pngData = Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);

  writeFileSync(filename, pngData);
  console.log(`Written: ${filename} (${width}x${height})`);
}

function createIconPixels(size) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.5;

  // Brand color: #4F46E5 for BG, white for strokes
  const bgR = 0x4F, bgG = 0x46, bgB = 0xE5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded square background (corner radius ~22% of size)
      const rr = size * 0.215;
      const inBg =
        x >= rr && x <= size - rr && y >= 0 && y <= size ||
        x >= 0 && x <= size && y >= rr && y <= size - rr ||
        (x - rr) ** 2 + (y - rr) ** 2 <= rr * rr ||
        (x - (size - rr)) ** 2 + (y - rr) ** 2 <= rr * rr ||
        (x - rr) ** 2 + (y - (size - rr)) ** 2 <= rr * rr ||
        (x - (size - rr)) ** 2 + (y - (size - rr)) ** 2 <= rr * rr;

      if (!inBg) {
        pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255; pixels[idx+3] = 0;
        continue;
      }

      // Default: bg color
      let r = bgR, g = bgG, b = bgB;

      // 'O' circle: centered at (38%, 50%), radius ~26% of size, stroke width ~10%
      const oCx = size * 0.38, oCy = size * 0.50;
      const oR = size * 0.255, oStroke = size * 0.10;
      const oDist = Math.sqrt((x - oCx) ** 2 + (y - oCy) ** 2);
      const onO = Math.abs(oDist - oR) <= oStroke / 2;

      // 'L' vertical bar: x in [60-69]%, y in [20-70]%
      const lX1 = size * 0.60, lX2 = size * 0.695;
      const lY1 = size * 0.195, lY2 = size * 0.73;
      const lStroke = size * 0.095;
      // Vertical
      const onLv = x >= lX1 - lStroke/2 && x <= lX1 + lStroke/2 && y >= lY1 && y <= lY2;
      // Horizontal
      const onLh = x >= lX1 - lStroke/2 && x <= lX2 + lStroke/2 && y >= lY2 - lStroke/2 && y <= lY2 + lStroke/2;

      if (onO || onLv || onLh) { r = 255; g = 255; b = 255; }

      pixels[idx] = r; pixels[idx+1] = g; pixels[idx+2] = b; pixels[idx+3] = 255;
    }
  }
  return pixels;
}

// Generate all sizes
writePng("public/favicon-32.png", 32, 32, createIconPixels(32));
writePng("public/favicon-180.png", 180, 180, createIconPixels(180));
writePng("public/favicon-192.png", 192, 192, createIconPixels(192));

console.log("All favicon PNGs generated.");
