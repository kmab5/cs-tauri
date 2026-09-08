/**
 * Reading .zip and .tar(.gz) in the browser, with no dependency.
 *
 * `DecompressionStream('deflate-raw')` is exactly the codec zip entries use,
 * and it is native in every current browser. gzip and plain tar are handled the
 * same way. Nothing here needs a server.
 */

export interface ArchiveEntry {
  path: string;
  data: Uint8Array;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream('gzip'),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Zips are read from the END: the end-of-central-directory record points at the
 * central directory, which lists every entry. Reading local headers front to
 * back is unreliable because sizes may live in a trailing data descriptor.
 */
async function readZip(buf: Uint8Array): Promise<ArchiveEntry[]> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const EOCD = 0x06054b50;

  let eocd = -1;
  const floor = Math.max(0, buf.length - 66560); // 64 KB comment ceiling
  for (let i = buf.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Not a valid zip file (no end-of-central-directory record)');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ArchiveEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue;

    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(`Unsupported zip compression method ${method} in ${name}`);

    entries.push({ path: name, data });
  }
  return entries;
}

/** 512-byte header blocks, each followed by content padded to 512 bytes. */
function readTar(buf: Uint8Array): ArchiveEntry[] {
  const decoder = new TextDecoder();
  const entries: ArchiveEntry[] = [];
  let off = 0;

  const str = (start: number, len: number) =>
    decoder.decode(buf.subarray(start, start + len)).replace(/\0.*$/, '');

  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break; // end-of-archive padding

    let name = str(off, 100);
    const size = parseInt(str(off + 124, 12).replace(/[^0-7]/g, ''), 8) || 0;
    const type = str(off + 156, 1);
    const prefix = str(off + 345, 155);
    if (prefix) name = `${prefix}/${name}`;

    off += 512;
    if (type === '0' || type === '') {
      entries.push({ path: name, data: buf.subarray(off, off + size) });
    }
    off += Math.ceil(size / 512) * 512;
  }
  return entries;
}

export async function extract(file: File): Promise<ArchiveEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf.length > 4 && new DataView(buf.buffer, buf.byteOffset).getUint32(0, true) === 0x04034b50;
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;

  if (isZip) return readZip(buf);
  if (isGzip) return readTar(await gunzip(buf));
  return readTar(buf);
}
