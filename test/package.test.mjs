import assert from 'node:assert/strict';
import { test } from 'node:test';
import zlib from 'node:zlib';
import { contentKey, zip } from '../tools/package.mjs';

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
