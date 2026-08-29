import { PortabilityError, MAX_EXPORT_BYTES } from './catalog.js';

const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', typeof bytes === 'string' ? encoder.encode(bytes) : bytes);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function utf8(value) { return encoder.encode(value); }

// ZIP32, UTF-8 filenames, stored entries. Bounds are enforced before allocation.
// Archives have no dependency on proprietary formats or an AGAPAY account.
export function createZip(files) {
  if (files.length > 2000) throw new PortabilityError('export_too_large', 'This export has too many files for the self-service exporter. Contact support for a full export.', 413);
  const entries = files.map(file => {
    if (!/^[a-zA-Z0-9_./-]+$/.test(file.name) || file.name.startsWith('/') || file.name.split('/').includes('..')) throw new Error('Unsafe archive path');
    return { ...file, filename: utf8(file.name), crc: crc32(file.bytes) };
  });
  const size = entries.reduce((n, f) => n + f.bytes.length + 76 + f.filename.length * 2, 22);
  if (size > MAX_EXPORT_BYTES) throw new PortabilityError('export_too_large', 'This parish exceeds the 24 MB self-service archive limit. No data was deleted. Contact support for a full export.', 413);
  const out = new Uint8Array(size), view = new DataView(out.buffer);
  let offset = 0;
  for (const f of entries) {
    f.offset = offset;
    view.setUint32(offset, 0x04034b50, true); view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x800, true); view.setUint16(offset + 12, 0x21, true);
    view.setUint32(offset + 14, f.crc, true); view.setUint32(offset + 18, f.bytes.length, true);
    view.setUint32(offset + 22, f.bytes.length, true); view.setUint16(offset + 26, f.filename.length, true);
    out.set(f.filename, offset + 30); out.set(f.bytes, offset + 30 + f.filename.length);
    offset += 30 + f.filename.length + f.bytes.length;
  }
  const centralOffset = offset;
  for (const f of entries) {
    view.setUint32(offset, 0x02014b50, true); view.setUint16(offset + 4, 20, true); view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x800, true); view.setUint16(offset + 14, 0x21, true);
    view.setUint32(offset + 16, f.crc, true); view.setUint32(offset + 20, f.bytes.length, true);
    view.setUint32(offset + 24, f.bytes.length, true); view.setUint16(offset + 28, f.filename.length, true);
    view.setUint32(offset + 42, f.offset, true); out.set(f.filename, offset + 46);
    offset += 46 + f.filename.length;
  }
  view.setUint32(offset, 0x06054b50, true); view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true); view.setUint32(offset + 12, offset - centralOffset, true);
  view.setUint32(offset + 16, centralOffset, true);
  return out;
}
