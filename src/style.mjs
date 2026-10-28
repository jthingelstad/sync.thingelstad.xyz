// Immutable package assets, loaded once like flows.json. The page renderer
// itself stays data-in, HTML-out. All fonts are inline, with no browser fetch.
import { readFileSync } from 'node:fs';

const root = new URL('../data/style/', import.meta.url);
const bookFont = (name) => readFileSync(new URL(`../data/atlas/fonts/${name}.woff2`, import.meta.url)).toString('base64');
export const sharedStyles = readFileSync(new URL('tokens.css', root), 'utf8')
  // Preserve the canonical copy on disk; replace its font faces with the
  // guide's upright families so snapshots carry only the faces they use.
  .replace(/@font-face\s*\{[^}]*\}\s*/g, '')
  + `\n@font-face{font-family:Fraunces;font-style:normal;font-weight:100 900;font-display:swap;src:url("data:font/woff2;base64,${bookFont('fraunces')}") format("woff2")}\n@font-face{font-family:'Source Sans 3';font-style:normal;font-weight:200 900;font-display:swap;src:url("data:font/woff2;base64,${bookFont('source-sans-3')}") format("woff2")}\n`;
export const pageStyles = readFileSync(new URL('./page.css', import.meta.url), 'utf8');
