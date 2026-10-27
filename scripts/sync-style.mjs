// The shared type stays byte-for-byte, fonts and licences included. Inline
// copies in the rendered page mean a visit needs no font or CSS request.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '../shared');
const files = ['tokens.css', ...['OFL-Inter.txt', 'OFL-InterTight.txt', 'inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2', 'inter-latin-wght-italic.woff2', 'inter-latin-ext-wght-italic.woff2', 'inter-tight-latin-wght-normal.woff2', 'inter-tight-latin-ext-wght-normal.woff2'].map((f) => `fonts/${f}`)];
let drift = 0;
for (const file of files) {
  const wanted = await fs.readFile(path.join(source, file)).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!wanted) { console.log(`${file}: no shared copy to compare (fine in CI)`); continue; }
  const target = path.join(root, 'data/style', file);
  const current = await fs.readFile(target).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (current?.equals(wanted)) continue;
  if (process.argv.includes('--check')) { console.error(`${file}: shared type drift; run npm run style:sync`); drift++; }
  else { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, wanted); console.log(`${file}: copied`); }
}
if (drift) process.exit(1);
