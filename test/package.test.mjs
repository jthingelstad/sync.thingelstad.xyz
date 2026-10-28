import assert from 'node:assert/strict';
import { test } from 'node:test';
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import { contentKey, packageProbe, zip } from '../tools/package.mjs';

const entries = [
  { name: 'src/b.mjs', data: Buffer.from('export const b = 2;\n') },
  { name: 'src/a.mjs', data: Buffer.from('export const a = 1;\n') },
];

test('the content key depends on names and contents only', () => {
  const key = contentKey(entries);
  assert.match(key, /^code\/[0-9a-f]{64}\.zip$/);
  assert.equal(contentKey([...entries].reverse()), key);
  assert.notEqual(contentKey([entries[0], { name: 'src/a.mjs', data: Buffer.from('changed') }]), key);
});

test('the zip is byte-for-byte deterministic and inflates back', () => {
  const one = zip(entries);
  const two = zip([...entries].reverse());
  assert.ok(one.equals(two));
  // First local header: src/a.mjs sorted first, deflated.
  assert.equal(one.readUInt32LE(0), 0x04034b50);
  const nameLength = one.readUInt16LE(26);
  const packedLength = one.readUInt32LE(18);
  assert.equal(one.subarray(30, 30 + nameLength).toString(), 'src/a.mjs');
  const inflated = zlib.inflateRawSync(one.subarray(30 + nameLength, 30 + nameLength + packedLength));
  assert.equal(inflated.toString(), 'export const a = 1;\n');
});

test('the deployable package includes both atlas assets beside the renderer', async () => {
  const manifest = await packageProbe();
  const data = await fs.readFile(manifest.path);
  const files = new Map();
  for (let offset = 0; data.readUInt32LE(offset) === 0x04034b50;) {
    const packed = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const name = data.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    files.set(name, zlib.inflateRawSync(data.subarray(start, start + packed)));
    offset = start + packed;
  }
  assert.ok(files.has('src/atlas.mjs'));
  for (const name of ['landmarks', 'terrain']) {
    const packaged = files.get(`data/atlas/${name}.webp`);
    assert.ok(packaged?.length > 10000, `${name} is present, not a placeholder`);
    assert.ok(packaged.equals(await fs.readFile(new URL(`../data/atlas/${name}.webp`, import.meta.url))));
  }
});
