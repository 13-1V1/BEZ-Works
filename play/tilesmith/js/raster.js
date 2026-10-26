// Created by: Brennan Meyer with use of Codex 09/17/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
(function () {
  'use strict';
  const MAX_BYTES = 32 * 1024 * 1024, MAX_PIXELS = 64000000;
  function inspect(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer);
    const fail = () => { throw new Error('Unrecognized or damaged image. Choose a PNG, JPEG, WebP, GIF, or BMP.'); };
    const need = (offset, count) => { if (offset < 0 || count < 0 || offset + count > bytes.length) fail(); };
    const text = (offset, count) => { need(offset, count); return String.fromCharCode(...bytes.subarray(offset, offset + count)); };
    const u16 = (offset, little = false) => { need(offset, 2); return view.getUint16(offset, little); };
    const u32 = (offset, little = false) => { need(offset, 4); return view.getUint32(offset, little); };
    const u24 = offset => { need(offset, 3); return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536; };
    const dimensions = (width, height, mime) => {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) fail();
      if (width * height > MAX_PIXELS) throw new Error('This image is too large. Choose an image with at most 64 million pixels.');
      return { width, height, mime };
    };
    if (bytes.length > MAX_BYTES) throw new Error('Choose an image no larger than 32 MiB.');
    need(0, 12);
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) {
      if (u32(8) !== 13 || text(12, 4) !== 'IHDR') fail();
      need(16, 17); return dimensions(u32(16), u32(20), 'image/png');
    }
    if (text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a') {
      const canvas = dimensions(u16(6, true), u16(8, true), 'image/gif'); need(0, 13);
      let offset = 13 + ((bytes[10] & 128) ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0);
      const skipBlocks = () => { while (true) { need(offset, 1); const length = bytes[offset++]; if (!length) return; need(offset, length); offset += length; } };
      while (offset < bytes.length) {
        const marker = bytes[offset++];
        if (marker === 59) return canvas;
        if (marker === 33) { need(offset++, 1); skipBlocks(); continue; }
        if (marker !== 44) fail();
        need(offset, 9);
        const frame = dimensions(u16(offset + 4, true), u16(offset + 6, true), 'image/gif');
        if (u16(offset, true) + frame.width > canvas.width || u16(offset + 2, true) + frame.height > canvas.height) fail();
        const packed = bytes[offset + 8]; offset += 9 + ((packed & 128) ? 3 * (2 ** ((packed & 7) + 1)) : 0);
        need(offset++, 1); skipBlocks();
      }
      fail();
    }
    if (text(0, 2) === 'BM') {
      const dib = u32(14, true); need(14, dib);
      if (dib === 12) return dimensions(u16(18, true), u16(20, true), 'image/bmp');
      if (![40, 52, 56, 108, 124].includes(dib)) fail();
      // Embedded JPEG/PNG bitmaps have another dimensions header; require ordinary BMP data.
      if ([4, 5].includes(u32(30, true))) fail();
      return dimensions(view.getInt32(18, true), Math.abs(view.getInt32(22, true)), 'image/bmp');
    }
    if (bytes[0] === 255 && bytes[1] === 216) {
      let offset = 2;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 255) fail();
        while (bytes[offset] === 255) offset++;
        need(offset, 1); const marker = bytes[offset++];
        if (marker === 0 || marker === 217 || marker === 218) fail();
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        const length = u16(offset); if (length < 2) fail(); need(offset, length);
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
          if (length < 8) fail(); return dimensions(u16(offset + 5), u16(offset + 3), 'image/jpeg');
        }
        offset += length;
      }
      fail();
    }
    if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
      const end = u32(4, true) + 8; if (end > bytes.length || end < 20) fail();
      let offset = 12, canvas = null, decoded = null;
      while (offset + 8 <= end) {
        const type = text(offset, 4), length = u32(offset + 4, true), start = offset + 8;
        if (start + length > end) fail();
        if (type === 'VP8X') {
          if (length !== 10 || canvas) fail(); canvas = dimensions(u24(start + 4) + 1, u24(start + 7) + 1, 'image/webp');
        } else if (type === 'VP8 ') {
          if (length < 10 || bytes[start] & 1 || text(start + 3, 3) !== '\u009d\u0001\u002a') fail();
          decoded = dimensions(u16(start + 6, true) & 16383, u16(start + 8, true) & 16383, 'image/webp');
        } else if (type === 'VP8L') {
          if (length < 5 || bytes[start] !== 47) fail(); const bits = u32(start + 1, true);
          decoded = dimensions((bits & 16383) + 1, ((bits >>> 14) & 16383) + 1, 'image/webp');
        } else if (type === 'ANMF') {
          if (!canvas || length < 16) fail();
          const frame = dimensions(u24(start + 6) + 1, u24(start + 9) + 1, 'image/webp');
          if (u24(start) * 2 + frame.width > canvas.width || u24(start + 3) * 2 + frame.height > canvas.height) fail();
        }
        offset = start + length + (length & 1);
      }
      if (canvas && decoded && (canvas.width !== decoded.width || canvas.height !== decoded.height)) fail();
      if (canvas || decoded) return canvas || decoded;
    }
    fail();
  }
  async function read(file) {
    if (!(file instanceof Blob) || file.size > MAX_BYTES) throw new Error('Choose an image no larger than 32 MiB.');
    const buffer = await file.arrayBuffer(), header = inspect(buffer);
    const url = URL.createObjectURL(new Blob([buffer], { type: header.mime }));
    try {
      const image = new Image(); image.src = url;
      try { await image.decode(); } catch { throw new Error('This image could not be decoded. Try another file.'); }
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new Error('The image dimensions are invalid or too large.');
      return image;
    } finally { URL.revokeObjectURL(url); }
  }
  window.TileRaster = { read, inspect };
})();
