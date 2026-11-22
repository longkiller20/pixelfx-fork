// A small PNG writer (RGBA, 8 bits per channel) on node:zlib, so the tools need no packages.

import { deflateSync, inflateSync } from "node:zlib";

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, "ascii"), data]), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode w x h RGBA bytes as a PNG buffer. */
export function encodePNG(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 1; // Sub filter: pixel art has long runs, so differences compress well
    for (let x = 0; x < stride; x++) raw[o + 1 + x] = (src[y * stride + x] - (x >= 4 ? src[y * stride + x - 4] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Decode a PNG buffer into { w, h, rgba } (8 bits per channel, RGBA). Reads grey, grey+alpha, RGB, RGBA and palette
 * images at 8 bits (16-bit channels are cut to their high byte, 1/2/4-bit palettes and greys unpacked); not interlaced.
 */
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, pal = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), t = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (t === "IHDR") (w = data.readUInt32BE(0)), (h = data.readUInt32BE(4)), (depth = data[8]), (type = data[9]), (interlace = data[12]);
    else if (t === "PLTE") pal = data;
    else if (t === "tRNS") trns = data;
    else if (t === "IDAT") idat.push(data);
    else if (t === "IEND") break;
    pos += 12 + len;
  }
  if (interlace) throw new Error("interlaced PNGs are not read: save it again without interlacing");
  if (w * h > 40_000_000) throw new Error("picture too large");
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error(`PNG colour type ${type} not read`);
  const bpp = Math.max(1, (ch * depth) >> 3), stride = Math.ceil((w * ch * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    prev = cur;
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  const sample = (row, i) => {
    // the i-th sample of a row, scaled to 8 bits
    if (depth === 8) return row[i];
    if (depth === 16) return row[i * 2];
    const per = 8 / depth, byte = row[Math.floor(i / per)], shift = 8 - depth * ((i % per) + 1), v = (byte >> shift) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < h; y++) {
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (type === 3) {
        const k = sample(row, x);
        rgba[o] = pal[k * 3], rgba[o + 1] = pal[k * 3 + 1], rgba[o + 2] = pal[k * 3 + 2], rgba[o + 3] = trns && k < trns.length ? trns[k] : 255;
      } else if (type === 0 || type === 4) {
        const g = sample(row, x * ch);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = type === 4 ? sample(row, x * ch + 1) : 255;
      } else {
        rgba[o] = sample(row, x * ch), rgba[o + 1] = sample(row, x * ch + 1), rgba[o + 2] = sample(row, x * ch + 2);
        rgba[o + 3] = type === 6 ? sample(row, x * ch + 3) : 255;
      }
    }
  }
  return { w, h, rgba };
}
