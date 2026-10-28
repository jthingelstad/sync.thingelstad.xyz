// Reuse the atlas artwork for the field guide. These are decorative crops
// of the existing assets; text, identities and evidence remain native.
import { PLACES } from './atlas.mjs';

export function landmark(system, className = '') {
  const place = PLACES[system];
  return place ? `<svg class="landmark landmark--${system} ${className}" viewBox="0 0 300 240" aria-hidden="true"><use href="#atlas-building-${place.sprite}" x="0" y="0" width="300" height="240"/></svg>` : '';
}

export function landscape(className = '', footer = false) {
  return `<svg class="landscape ${className}" viewBox="0 ${footer ? 1160 : 0} 2240 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#atlas-terrain"/></svg>`;
}
