// Package the probe and webhook intake: src/, data/flows.json, shared type and Pele (the one
// package the probe needs beyond the AWS SDK the Node runtime provides: a
// single self-contained file, copied from node_modules so the map is drawn
// on every run), zipped into .build/sync.zip. No bundler. The zip's key,
// code/<sha256>.zip, hashes
// the entries' names and contents rather than the zip's bytes, so the same
// source gives the same key on any machine and a deploy of an unchanged
// package has nothing to do (the approach cards and Linking Things settled
// on, 2026-10-24).
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, '.build');

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// 1980-01-01, the earliest DOS date, for every entry.
const DOS_DATE = (1 << 5) | 1;

/** A zip of the entries, in name order, deflated. */
export function zip(entries) {
  const files = [...entries].sort((a, b) => (a.name < b.name ? -1 : 1));
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const file = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(file.length, 26);
    local.push(header, file, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE((3 << 8) | 20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(file.length, 28);
    entry.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, file);
    offset += header.length + file.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

/** code/<hash of the entries' names and contents>.zip */
export function contentKey(entries) {
  const hash = createHash('sha256');
  for (const { name, data } of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1)))
    hash.update(`${name}\n${sha256(data)}\n`);
  return `code/${hash.digest('hex')}.zip`;
}

/** Pele as the Lambda sees it: its package.json (the entry points) and dist/pele.js, which imports nothing. */
export async function vendorPele() {
  const dir = path.join(ROOT, 'node_modules/pele');
  const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
  const bundle = await fs.readFile(path.join(dir, 'dist/pele.js'));
  if (/^\s*import\s|\bfrom\s*["'][^"']+["'];?\s*$/m.test(bundle.toString('utf8').slice(0, 2000))) throw new Error('pele/dist/pele.js imports something; vendor it too');
  return [
    { name: 'node_modules/pele/package.json', data: Buffer.from(`${JSON.stringify({ name: pkg.name, version: pkg.version, type: pkg.type, exports: { '.': { import: './dist/pele.js', default: './dist/pele.js' } } })}\n`) },
    { name: 'node_modules/pele/dist/pele.js', data: bundle },
  ];
}

export async function packageProbe() {
  const sources = (await fs.readdir(path.join(ROOT, 'src'))).filter((f) => /\.(?:mjs|css)$/.test(f)).sort();
  const style = ['tokens.css', ...(await fs.readdir(path.join(ROOT, 'data/style/fonts'))).map((f) => `fonts/${f}`)];
  const entries = [
    ...(await Promise.all(sources.map(async (f) => ({ name: `src/${f}`, data: await fs.readFile(path.join(ROOT, 'src', f)) })))),
    { name: 'data/flows.json', data: await fs.readFile(path.join(ROOT, 'data/flows.json')) },
    ...(await Promise.all(style.map(async (f) => ({ name: `data/style/${f}`, data: await fs.readFile(path.join(ROOT, 'data/style', f)) })))),
    { name: 'package.json', data: Buffer.from('{"type":"module"}\n') },
    ...(await vendorPele()),
  ];
  const archive = zip(entries);
  const manifest = {
    key: contentKey(entries),
    checksumSha256: createHash('sha256').update(archive).digest('base64'),
    size: archive.length,
    path: path.join(OUT, 'sync.zip'),
  };
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(manifest.path, archive);
  await fs.writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await packageProbe();
  console.log(JSON.stringify(manifest, null, 2));
}
