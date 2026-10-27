// Vendor the flows contract from the thingelstad.com repo, the way the sites
// vendor sites.json: `npm run flows:sync` copies shared/flows.json and the
// rendered shared/flows.html into data/; `npm run flows:check` fails when the
// copies have drifted from the shared files, so a hop changed in the contract
// reaches the probe (and the published /flows/ page) on the next deploy.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = path.resolve(ROOT, '../shared');
const FILES = ['flows.json', 'flows.html'];
const check = process.argv.includes('--check');

let drift = 0;
for (const file of FILES) {
  const source = path.join(SHARED, file);
  const target = path.join(ROOT, 'data', file);
  const wanted = await fs.readFile(source, 'utf8').catch(() => null);
  if (wanted === null) {
    // CI checks out only this repo; the vendored copy is what it tests.
    console.log(`${file}: no ../shared copy to compare (fine in CI)`);
    continue;
  }
  const current = await fs.readFile(target, 'utf8').catch(() => null);
  if (current === wanted) {
    console.log(`${file}: current`);
    continue;
  }
  if (check) {
    console.error(`${file}: data/${file} differs from ../shared/${file}; run npm run flows:sync`);
    drift++;
  } else {
    await fs.writeFile(target, wanted);
    console.log(`${file}: copied`);
  }
}

if (drift) process.exit(1);
