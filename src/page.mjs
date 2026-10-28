// Four small scriptless pages from the same observation. Rendering never
// collects facts or advances a journal. JSON routes and archives stay put.
import { flows, systemName } from './flows.mjs';
import { historyLanes, journeyLanes } from './lanes.mjs';
import { KIND_LABEL, itemLabel, movedThisWeek, storyFor } from './stories.mjs';
import { pageStyles, sharedStyles } from './style.mjs';
import { hopSummary, mapSvg, pocketMap } from './map.mjs';
import { atlasArtwork, atlasNavigation } from './atlas.mjs';
import { followAtlas, followModels, followPicker } from './follow.mjs';
import { connectionActions, coverageLedger, coverageSummary, factsList, hopsTable, matrixTable, receiptCard, triggerText } from './evidence.mjs';
import { coverageModel } from './coverage.mjs';
import { landmark, landscape } from './folio.mjs';
import { central } from './time.mjs';
import { bookmarkBatch, bookmarkBatchLink } from './bookmark-batch-page.mjs';
export { itemLabel } from './stories.mjs';
export { triggerText } from './evidence.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PAGES = [['map', 'Map', '/'], ['journeys', 'Journeys', '/journeys/'], ['history', 'History', '/history/'], ['records', 'Records', '/records/']];
const pill = (s) => `<span class="pill pill--${s}">${s === 'no-fact' ? 'no fact yet' : s}</span>`;

function frame({ active, title, intro, content, status, art = null }) {
  const checked = status ? `Checked ${esc(central(status.checked_at))}, ${triggerText(status.trigger)}.` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${active === 'map' ? 'Sync state' : `${esc(title)} · Sync state`}</title>
<meta name="description" content="${esc(intro)}"><meta name="robots" content="noindex">
<link rel="alternate" type="application/json" href="/status.json">
<style>${sharedStyles}\n${pageStyles}</style></head>
<body class="folio folio--${active}">
${atlasArtwork()}
<a class="skip-link" href="#content">Skip to content</a>
<header class="site-header"><a class="site-brand" href="/">${landmark('feedbin')}<span>${active === 'map' ? 'Jamie Thingelstad / Sync state' : 'Things in flow'}</span></a>
<nav class="site-nav" aria-label="Site navigation">${PAGES.map(([id, name, url]) => `<a href="${url}"${active === id ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</nav>${landscape('header-landscape')}</header>
<main id="content"><header class="masthead${art ? ' masthead--illustrated' : ''}"><div><h1>${esc(title)}</h1><p class="lede">${esc(intro)}</p>${checked ? `<p class="checked">${checked}</p>` : ''}</div>${art ? landmark(art, 'masthead-art') : ''}</header>
${content}</main>
<footer class="site-footer">${landscape('footer-landscape', true)}<div class="footer-line"><span>Jamie Thingelstad · Things in flow</span><a href="/flows/">Flows contract</a><a href="https://github.com/jthingelstad/sync.thingelstad.xyz">Source</a></div>
<details class="colophon"><summary>Snapshot &amp; data</summary><p>${checked} A snapshot, refreshed on events and the half-hour clock. Reload for the latest.</p>
${status?.code ? `<p>Published by the sync probe (<code>${esc(status.code)}</code>).</p>` : ''}<p><a href="/status.json">Status JSON</a> · <a href="/journeys.json">Current journeys</a> · <a href="/journeys/index.json">Journey history</a> · <a href="/facts/wt-builder.json">Publisher fact</a></p><p>Each receipt is at <code>/receipts/&lt;kind&gt;.json</code>. After receiving a publication event, the probe schedules checks at 2, 5, 10, 15, 30, 45 and 60 minutes. Discovery and delivery can happen after publication. No browser script or automatic refresh.</p></details></footer>
</body></html>`;
}

// Forward old same-page bookmarks without browser script. These short
// links appear only when their old fragment is actually requested.
function legacyLinks(status, journeys) {
  const known = new Set(followModels(status, journeys).map((m) => m.kind));
  const links = [['journeys', '/journeys/', 'journeys'], ['history', '/history/', 'history'], ['receipts', '/journeys/', 'receipts'], ['hops', '/records/#hops', 'hop details'],
    ...[...new Set(status.hops.map((h) => h.id))].map((id) => [`hop-${id}`, `/records/#hop-${id}`, `hop ${id}`]),
    ...flows.systems.map((s) => [`fact-${s.id}`, `/records/#fact-${s.id}`, `${s.name} facts`]),
    ...status.receipts.map((r) => [`journey-${r.kind}`, known.has(r.kind) ? `/journeys/#journey-${r.kind}` : '/journeys/', known.has(r.kind) ? `${r.kind} journey` : 'journey records'])];
  return `<aside class="legacy-links" aria-label="Moved evidence">${links.map(([id, url, name]) => `<a class="legacy-link" id="${id}" href="${url}">View ${esc(name)} on its new page →</a>`).join('')}</aside>`;
}

function evidenceLinks(html) {
  return html.replace(/href="#((?:hop-|fact-)[^"]+)"/g, 'href="/records/#$1"')
    .replace(/href="#journeys"/g, 'href="/journeys/"');
}

function attention(status) {
  if (!status.open.length) return '';
  return `<aside class="attention"><strong>Needs a look</strong><ul>${status.open.map((h) => `<li><a href="/records/#hop-${h.id}">${esc(systemName(h.from))} → ${esc(systemName(h.to))}</a><span>${esc(h.kind)} ${pill(h.status)}</span></li>`).join('')}</ul></aside>`;
}

function mapPage(status, journeys) {
  const models = followModels(status, journeys);
  const pocket = pocketMap(status, journeys);
  const atlas = `<section class="atlas-section${models.length ? ' atlas-section--following' : ''}" id="map" aria-label="The publishing atlas">
${followAtlas(status, journeys, models)}
<div class="atlas-overview" id="all-connections" tabindex="-1">${followPicker(models)}${pocket}
<section id="whole-atlas" class="atlas-full${pocket ? '' : ' atlas-full--fallback'}" aria-label="Whole publishing atlas"><a class="atlas-back" href="#all-connections">Back to route view ↑</a>${atlasNavigation()}
<div class="map" tabindex="0" role="region" aria-label="Publishing atlas, scroll sideways to explore">${mapSvg(status, journeys, { inlineArt: false })}</div>
<p class="atlas-caption">A snapshot, not continuous tracking. Geography and road length are illustrative. Roof colours identify places; words and arrows carry state.</p></section>
<details class="atlas-key"><summary>Map key</summary><p>A signpost quotes a lag only for a measured arrival. Reported arrivals come from events; seen arrivals come from polls. Dashed roads run on a clock; solid roads run on an event or nudge. No fact yet means no readable evidence; unknown means the reader failed.</p></details></div></section>`;
  return legacyLinks(status, journeys) + evidenceLinks(atlas) + attention(status) + coverageSummary(status) + (status.bookmark_batch ? `<p class="page-actions">${bookmarkBatchLink(status.bookmark_batch)}</p>` : '');
}

function feedbinReceipt(fact) {
  const f = fact?.extra;
  if (!f?.mode) return '';
  return `<details class="import-receipt"><summary>Feedbin → Pinboard · ${esc(f.pending)} pending · ${esc(f.confirmed)} confirmed${f.mode === 'preview' ? ' · preview' : ''}</summary><p>${esc(f.articles_in_feed)} articles in the feed. ${f.last_import_at ? `Last import check ${esc(central(f.last_import_at))}. ` : ''}The feed does not give star times. Existing bookmarks keep their notes, tags and dates.</p>${f.importer_error ? `<p>${esc(f.importer_error)}</p>` : ''}</details>`;
}

function journeysPage(status, journeys, history) {
  const models = followModels(status, journeys);
  const batch = bookmarkBatch(status.bookmark_batch);
  if (!models.length) return '<p class="empty">No item is on a journey yet. <a href="/">Back to the map</a>.</p>' + batch;
  return `<div class="journal-views">${models.map((m, i) => `<article class="journal-view${i === 0 ? ' journal-view--default' : ''}" tabindex="-1">
${followPicker(models, m.kind, { prefix: '#journey-', all: false })}
<div class="page-actions"><a href="/#follow-${m.kind}">← Back to the map</a><a href="/history/#history-${m.kind}">View history →</a></div>
<div class="paper-panel journal-paper">${landmark(m.origin, 'journal-art')}
<!-- story:${movedThisWeek(m.journey, status.checked_at) ? 'recent' : 'older'} --><section class="story"><h2 class="sr-only">${esc(KIND_LABEL[m.kind])}</h2><p>${esc(storyFor(m.journey))}</p></section><!-- /story -->
<!-- journey-lanes -->${journeyLanes(m.journey, history, status.checked_at)}<!-- /journey-lanes -->
</div><details class="receipt-disclosure"><summary>Receipt · ${m.holders.length} systems</summary><div id="receipt-${m.kind}">${receiptCard(m)}</div></details>${m.kind === 'star' ? feedbinReceipt(status.facts.feedbin) + bookmarkBatch(status.bookmark_batch) : ''}
</article>`).join('')}</div>${models.some(m => m.kind === 'star') ? '' : batch}<details class="reading-key"><summary>How to read the journey</summary><p>Each lane is time since publication, on a linear scale. A circle means seen in a poll; a square means reported by an event. The dashed marker is the median of finished measured journeys. First confirmations have no measured lag or time mark. Polls show their check interval; reports show one-second resolution.</p></details>`;
}

function historyPage(status, journeys, history) {
  const currentKinds = new Set(followModels(status, journeys).map((m) => m.kind));
  const kinds = [...new Set([...currentKinds, ...Object.keys(history?.kinds ?? {})])];
  const groups = kinds.map((kind) => [kind, history?.kinds?.[kind] ?? []]);
  if (!groups.length) return '<p class="empty">History starts with the next superseded item. A first check is not a measured journey.</p>';
  const first = groups.find(([ , rows]) => rows.some((r) => !r.active))?.[0] ?? groups[0][0];
  const picker = (selected) => groups.length > 1 ? `<nav class="kind-picker" aria-label="Choose a history kind">${groups.map(([kind]) => `<a href="#history-${kind}"${kind === selected ? ' aria-current="true"' : ''}>${esc(KIND_LABEL[kind] ?? kind)}</a>`).join('')}</nav>` : '';
  return `<div class="history-views">${groups.map(([kind, rows]) => `<section class="history-view${kind === first ? ' history-view--default' : ''}" id="history-${kind}" tabindex="-1">${picker(kind)}<div class="paper-panel history-paper">${landmark(rows[0]?.origin ?? 'links', 'history-art')}
${rows.some((r) => !r.active) ? `<!-- history-lanes -->${historyLanes({ ...history, kinds: { [kind]: rows } })}<!-- /history-lanes -->` : `<h2>${esc(KIND_LABEL[kind] ?? kind)}</h2><p class="empty">No finished journey for this kind yet. A first check is not a measured journey.</p><a href="${currentKinds.has(kind) ? `/journeys/#journey-${kind}` : '/journeys/'}">${currentKinds.has(kind) ? 'View the current journey' : 'View current journeys'} →</a>`}
</div></section>`).join('')}</div>`;
}

function recordsTabs(selected) {
  return `<nav class="records-tabs" aria-label="Records views">${[['inventory', 'Inventory'], ['coverage', 'Coverage'], ['hops', 'Hops'], ['facts', 'Facts']].map(([id, name]) => `<a href="#${id}"${selected === id ? ' aria-current="true"' : ''}>${name}</a>`).join('')}</nav>`;
}

function recordsPage(status) {
  const coverage = coverageModel(status);
  const featured = status.open[0]?.id ?? flows.hops[0].id;
  const connections = `<details class="connection-picker"><summary>Choose a connection · ${flows.hops.length}</summary><nav aria-label="Choose a connection">${flows.hops.map((h) => `<a href="#hop-${h.id}"><span>${h.id}. ${esc(systemName(h.from))} → ${esc(systemName(h.to))}</span>${pill(hopSummary(status.hops, h.id).status)}</a>`).join('')}</nav></details>
<div class="hop-records">${flows.hops.map((h) => `<article class="hop-record${h.id === featured ? ' hop-record--default' : ''}"><header class="connection-heading"><div><h2>${h.id} · ${esc(systemName(h.from))} → ${esc(systemName(h.to))}</h2><p>${h.kinds.map(esc).join(' · ')}</p></div><div class="connection-art">${landmark(h.from)}<span aria-hidden="true">→</span>${landmark(h.to)}</div></header><div class="scroll">${hopsTable(status.hops.filter((r) => r.id === h.id))}</div><p class="evidence-note">“Behind” is the source item's age, against this hop's expected lag. A fallback witness is named explicitly; an unknown or missing fact never proves absence.</p>${connectionActions(h, status, coverage.checks.filter((c) => c.hop.id === h.id))}<a class="contract-link" href="/flows/#hop-${h.id}">Read this hop's flows contract →</a></article>`).join('')}</div>`;
  return `<div class="records-views"><section class="records-panel records-panel--default" id="inventory" tabindex="-1">${recordsTabs('inventory')}<div class="paper-panel"><h2>What each system holds</h2><div class="scroll" tabindex="0" role="region" aria-label="Inventory, scroll sideways to explore">${matrixTable(status.matrix)}</div><p class="evidence-note">A cell describes the worst incoming hop for its kind. The item and date are the system's own newest fact.</p></div></section>
<section class="records-panel" id="coverage" tabindex="-1">${recordsTabs('coverage')}<div class="paper-panel">${coverageLedger(status, coverage)}</div></section>
<section class="records-panel" id="hops" tabindex="-1">${recordsTabs('hops')}<div class="paper-panel">${connections}</div></section>
<section class="records-panel" id="facts" tabindex="-1">${recordsTabs('facts')}<div class="paper-panel"><h2>Facts, as read</h2><p class="section-note">Open a system to inspect the evidence the probe read.</p>${factsList(status.facts)}</div></section></div>`;
}

export function renderPage(status, journeys = {}, history = null, view = 'map') {
  const spec = {
    map: { title: 'Things in flow', intro: 'The publishing pipes: what is moving, where it has arrived, and what is still waiting.', content: () => mapPage(status, journeys) },
    journeys: { title: 'Journeys', intro: 'One item, from its source to the places that hold it.', art: 'weekly', content: () => journeysPage(status, journeys, history) },
    history: { title: 'History', intro: 'Finished journeys, with their original arrival evidence.', art: 'links', content: () => historyPage(status, journeys, history) },
    records: { title: 'Records', intro: 'The evidence behind the map.', art: 'librarian', content: () => recordsPage(status) },
  }[view];
  if (!spec) throw new Error('Unknown guide page');
  return frame({ ...spec, active: view, status, content: spec.content() });
}

export function renderSite(status, journeys = {}, history = null) {
  return Object.fromEntries(PAGES.map(([id, , url]) => [`${url.slice(1)}index.html`, renderPage(status, journeys, history, id)]));
}

export function renderNotFound() {
  return frame({ active: 'not-found', title: 'That path is not on this map.', intro: 'The publishing atlas is a good place to start.', art: 'feedbin', content: '<p><a class="primary-link" href="/">Back to the map →</a></p>' });
}
