// Immutable package assets, loaded once like flows.json. The page renderer
// itself stays data-in, HTML-out. All fonts are inline, with no browser fetch.
import { readFileSync } from 'node:fs';

const root = new URL('../data/style/', import.meta.url);
export const sharedStyles = readFileSync(new URL('tokens.css', root), 'utf8')
  // The canonical copy keeps its faces; this page uses no italic type, so
  // it need not send those unused font bytes with every snapshot.
  .replace(/@font-face\s*\{[^}]*font-style:\s*italic;[^}]*\}\s*/g, '')
  .replace(/src: url\("(fonts\/[a-z-]+\.woff2)"\)[^;]+;/g, (_, file) => `src: url("data:font/woff2;base64,${readFileSync(new URL(file, root)).toString('base64')}") format("woff2");`);
export const pageStyles = readFileSync(new URL('./page.css', import.meta.url), 'utf8');
