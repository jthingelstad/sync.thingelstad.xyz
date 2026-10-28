// Item selection is a presentation of this snapshot's receipt, never a new
// observation. In particular, two matching older corpora are not an arrival
// of the newer item being followed. The full atlas keeps its hop-local view.
import { flows, systemName } from './flows.mjs';
import { atlasCovers, atlasSvg } from './atlas.mjs';
import { hopSummary, nodeState, shortItem } from './map.mjs';
import { holds } from './probe.mjs';
import { duration, itemLabel, KIND_LABEL, measuredHours } from './stories.mjs';
import { age, central } from './time.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CHOICE = { issue: 'Weekly Thing', post: 'Blog post', link: 'Saved link', episode: 'Podcast', audio: 'Audio edition', star: 'Feedbin star' };

/** Use the receipt for the very same current journey, never a mixed snapshot. */
export function followModels(status, journeys) {
  return status.receipts.filter((r) => r.item && journeys[r.kind]
    && String(journeys[r.kind].item.id) === String(r.item.id)).map((receipt) => {
    const journey = journeys[receipt.kind];
    const holders = [{ system: receipt.origin, kind: receipt.kind, state: 'has', origin: true }, ...receipt.holders];
    const bySystem = new Map(holders.map((h) => [h.system, h]));
    const hops = status.hops.filter((h) => h.kind === receipt.kind
      || receipt.holders.some((holder) => holder.label && holder.system === h.to && holder.kind === h.kind)).map((row) => {
      const destination = bySystem.get(row.to);
      // Preserve unknown/no-fact and unsent legs from the actual hop. Only
      // narrow a readable hop when its destination lacks the selected item.
      if (['unknown', 'no-fact'].includes(row.status)) return { ...row };
      const source = bySystem.get(row.measured_from ?? row.from);
      // A queued blog post may already be in the public feed while the
      // current journey still follows its earlier, consumed bus event.
      const sameItem = row.source && holds(row.source, receipt.item) && holds(receipt.item, row.source);
      if (destination?.state === 'has' && source?.state === 'has' && row.source && !sameItem) {
        return { ...row, status: 'fresh', lag_hours: 0, why: 'The destination confirms this selected item.' };
      }
      if (destination?.state !== 'behind') return { ...row };
      if (source?.state !== 'has' || !holds(row.source, receipt.item)) {
        return { ...row, status: 'moving', lag_hours: null, waiting_upstream: true,
          why: `${systemName(row.from)} has not confirmed this item yet.` };
      }
      if (!sameItem) return { ...row, status: 'moving', lag_hours: null,
        why: 'The destination has not confirmed this item; no hop timing is recorded for it.' };
      return { ...row };
    });
    return { ...receipt, journey, holders, hops };
  });
}

export function followPicker(models, selected = null) {
  if (!models.length) return '';
  return `<nav class="follow-picker" aria-label="Follow an item">${models.map((m) => `<a href="#follow-${m.kind}"${m.kind === selected ? ' aria-current="true"' : ''}><span>${esc(CHOICE[m.kind] ?? m.kind)}</span>${['issue', 'audio'].includes(m.kind) ? `<strong>${esc(itemLabel(m.kind, m.item))}</strong>` : ''}</a>`).join('')}<a href="#all-connections"${selected === null ? ' aria-current="true"' : ''}><span>All connections</span></a></nav>`;
}

function arrivalText(model, system) {
  const arrival = model.journey.arrivals?.[system];
  if (!arrival) return 'Arrival time unmeasured';
  const lag = measuredHours(model.journey, arrival);
  const method = arrival.via ? 'Reported' : arrival.observed ? 'Seen' : 'Confirmed';
  return `${method} ${central(arrival.at)}${lag == null ? arrival.observed ? ' · elapsed time unmeasured' : ' · arrival time unmeasured' : ` · ${duration(lag)} after publication`}${arrival.observed && arrival.resolution_seconds ? ` · ${duration(arrival.resolution_seconds / 3600)} ${arrival.via ? 'resolution' : 'check interval'}` : ''}`;
}

function summary(model) {
  const groups = [
    ['has', 'Confirmed'], ['behind', 'Still waiting'], ['no-fact', 'No evidence yet'], ['unknown', 'Reader unavailable'],
  ];
  return `<div class="follow-summary">${groups.map(([state, title]) => {
    const holders = model.holders.filter((h) => h.state === state);
    if (!holders.length) return '';
    return `<section class="follow-group follow-group--${state}"><h4>${title}</h4><ul>${holders.map((h) => `<li><a href="#fact-${h.system}">${esc(systemName(h.system))}${h.label ? ` (${esc(h.label)})` : ''}</a><span>${esc(h.origin ? 'Source fact' : state === 'has' ? arrivalText(model, h.system) : state === 'behind' && h.newest ? `Holds ${itemLabel(h.kind, h.newest)}` : h.why ?? 'No readable fact for this item.')}</span></li>`).join('')}</ul></section>`;
  }).join('')}</div>`;
}

export function followEdgeText(model, id) {
  const row = model.hops.find((h) => h.id === id);
  const name = shortItem(model.kind, model.item).replace(/star \d{8,}/, 'saved star');
  let state = row.status === 'no-fact' ? 'no fact yet' : row.status;
  if (row.waiting_upstream) state = 'waiting upstream';
  else if (row.status === 'fresh') {
    const arrival = model.journey.arrivals?.[row.to];
    const lag = measuredHours(model.journey, arrival);
    state = lag == null ? arrival?.via ? 'reported' : arrival?.observed ? 'seen' : 'confirmed' : `${arrival.via ? 'reported' : 'in'} ${duration(lag)}`;
  } else if (['moving', 'late'].includes(row.status) && row.lag_hours != null) state += ` ${age(row.lag_hours)}`;
  return `${id} · ${name} · ${state}`;
}

function itemMap(model, status) {
  if (!atlasCovers(flows)) return '<p class="muted">The complete connection diagram is available in <a href="#all-connections">All connections</a>.</p>';
  const holders = new Map(model.holders.map((h) => [h.system, h]));
  const svg = atlasSvg({ ...status, hops: model.hops }, { [model.kind]: model.journey }, {
    hopSummary, nodeState,
    edgeText: (_, __, id) => followEdgeText(model, id),
    nodeText: (id) => {
      const h = holders.get(id);
      return h?.state === 'has' ? `${shortItem(model.kind, model.item)} · confirmed`
        : h?.state === 'behind' ? 'still waiting for this item'
          : h?.state === 'unknown' ? 'reader unavailable' : 'no fact yet';
    },
  }, { inlineArt: false, hopIds: model.hops.map((h) => h.id), prefix: `follow-${model.kind}-` });
  return `<a class="follow-map-link" href="#follow-${model.kind}-map">Explore this item’s map ↓</a>
<div class="follow-map" id="follow-${model.kind}-map" tabindex="-1"><a class="follow-map-back" href="#follow-${model.kind}">Back to this item’s summary ↑</a><div class="map" tabindex="0" role="region" aria-label="Atlas for ${esc(itemLabel(model.kind, model.item))}, scroll sideways to explore">${svg}</div></div>`;
}

export function followAtlas(status, journeys, models = followModels(status, journeys)) {
  return models.map((model, i) => `<section class="follow-view${i === 0 ? ' follow-view--default' : ''}" id="follow-${model.kind}" tabindex="-1" aria-labelledby="follow-${model.kind}-title">
${followPicker(models, model.kind)}
<header class="follow-heading"><p class="kicker">Follow this item · ${esc(KIND_LABEL[model.kind])}</p><h3 id="follow-${model.kind}-title">${esc(itemLabel(model.kind, model.item))}</h3>${model.item.title && ['issue', 'audio'].includes(model.kind) ? `<p>${esc(model.item.title)}</p>` : ''}<p class="muted">${model.item.at ? `Dated ${esc(central(model.item.at))}` : model.kind === 'star' ? 'Star time unknown' : 'Publication time unknown'} · from ${esc(systemName(model.origin))}</p></header>
${summary(model)}
${itemMap(model, status)}
<details class="follow-connections"><summary>${model.hops.length} connections and their evidence</summary><ol>${model.hops.map((h) => `<li><a href="#hop-${h.id}">${h.id}. ${esc(systemName(h.from))} → ${esc(systemName(h.to))}</a><strong>${esc(followEdgeText(model, h.id).split(' · ').slice(2).join(' · '))}</strong>${h.why ? `<span>${esc(h.why)}</span>` : ''}</li>`).join('')}</ol></details>
<p class="follow-note">Only this item’s kinds are shown. “Waiting upstream” means the source has not confirmed this item; matching older copies do not prove arrival. <a href="#journey-${model.kind}">This item’s journey lanes ↓</a> · <a href="#history">History ↓</a></p>
</section>`).join('\n');
}
