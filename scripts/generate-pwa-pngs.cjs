const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC table for PNG chunks
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const toCrc = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([lenBuf, toCrc, crcBuf]);
}

function generatePng(width, height, isMaskable = false) {
  // RGBA buffer: each row has 1 filter byte (0) + width * 4 bytes
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  const cx = width / 2;
  const cy = height / 2;
  const chipSize = width * 0.52;
  const radius = width * (isMaskable ? 0.05 : 0.2);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pOffset = rowOffset + 1 + x * 4;

      // Dark background gradient #090d16 -> #0f172a
      const t = (x + y) / (width + height);
      let r = Math.round(9 + t * 15);
      let g = Math.round(13 + t * 15);
      let b = Math.round(22 + t * 25);
      let a = 255;

      // Outer rounded rect margin
      const margin = isMaskable ? 0 : width * 0.04;
      const innerX = x - cx;
      const innerY = y - cy;

      // Processor / Terminal inner box: [-chipSize/2, +chipSize/2]
      if (
        Math.abs(innerX) <= chipSize / 2 &&
        Math.abs(innerY) <= chipSize / 2
      ) {
        // Chip fill
        r = 30;
        g = 41;
        b = 59;

        // Terminal top bar
        if (innerY <= -chipSize / 2 + chipSize * 0.22) {
          r = 15;
          g = 23;
          b = 42;

          // Traffic light dots
          const dotY = -chipSize / 2 + chipSize * 0.11;
          const dist1 = Math.hypot(innerX - (-chipSize * 0.3), innerY - dotY);
          const dist2 = Math.hypot(innerX - (-chipSize * 0.15), innerY - dotY);
          const dist3 = Math.hypot(innerX - 0, innerY - dotY);
          const dotR = width * 0.018;

          if (dist1 <= dotR) {
            r = 239; g = 68; b = 68; // Red
          } else if (dist2 <= dotR) {
            r = 245; g = 158; b = 11; // Yellow
          } else if (dist3 <= dotR) {
            r = 16; g = 185; b = 129; // Green
          }
        } else {
          // Terminal prompt >_
          // Chevron '>'
          const lineW = width * 0.024;
          const px = innerX + chipSize * 0.25;
          const py = innerY - chipSize * 0.05;

          // Draw '>'
          const inUpperArm = Math.abs(px - py) <= lineW && py >= -chipSize * 0.15 && py <= 0 && px <= chipSize * 0.1;
          const inLowerArm = Math.abs(px + py) <= lineW && py >= 0 && py <= chipSize * 0.15 && px <= chipSize * 0.1;

          if (inUpperArm || inLowerArm) {
            r = 34; g = 211; b = 238; // Cyan #22d3ee
          }

          // Underscore cursor '_'
          if (
            innerX >= chipSize * 0.05 &&
            innerX <= chipSize * 0.28 &&
            Math.abs(innerY - (chipSize * 0.15)) <= lineW / 2
          ) {
            r = 251; g = 191; b = 36; // Amber #fbbf24
          }
        }
      }

      rawData[pOffset] = r;
      rawData[pOffset + 1] = g;
      rawData[pOffset + 2] = b;
      rawData[pOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA (6)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT
  const idatChunk = makeChunk('IDAT', deflated);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), generatePng(192, 192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), generatePng(512, 512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), generatePng(512, 512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), generatePng(180, 180, false));
fs.writeFileSync(path.join(outDir, 'favicon.ico'), generatePng(32, 32, false));

console.log('Successfully generated all PWA PNG icons in public/ directory!');
