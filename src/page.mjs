// The sync page: one scriptless HTML page from a status. Facts only, so it
// is fine to publish: newest ids and ages, never a secret, never a visitor.
import { systemName, systemsById } from './flows.mjs';
import { historyLanes, journeyLanes } from './lanes.mjs';
import { itemLabel, KIND_LABEL, movedThisWeek, storyFor } from './stories.mjs';
import { pageStyles, sharedStyles } from './style.mjs';
export { itemLabel } from './stories.mjs';
import { hopSummary, mapSvg, shortItem } from './map.mjs';
import { atlasNavigation } from './atlas.mjs';
import { age, central } from './time.mjs';

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATUS_LABEL = { fresh: 'fresh', moving: 'moving', late: 'late', held: 'held', 'no-fact': 'no fact yet', unknown: 'unknown' };
const HOLDER_LABEL = { has: 'has it', behind: 'behind', 'no-fact': 'no fact yet', unknown: 'unknown' };

const pill = (status) => `<span class="pill pill--${esc(status)}">${esc(STATUS_LABEL[status] ?? status)}</span>`;

const when = (item) => (item?.at ? `<span class="muted">${esc(central(item.at))}</span>` : '');

function receiptCard(r) {
  if (!r.item) {
    return `<section class="receipt"><h3>${esc(KIND_LABEL[r.kind] ?? r.kind)}</h3><p class="muted">No system publishes a fact for the newest ${esc(r.kind)} yet.</p></section>`;
  }
  const rows = r.holders
    .map(
      (h) => `<li class="holder holder--${esc(h.state)}"><span class="holder__mark" aria-hidden="true"></span><span class="holder__name">${esc(systemName(h.system))}${h.label ? ` <span class="muted">(${esc(h.label)})</span>` : ''}</span><span class="holder__state">${esc(HOLDER_LABEL[h.state])}${h.state === 'behind' && h.newest ? `: ${esc(itemLabel(h.kind, h.newest))}` : ''}${h.state !== 'has' && h.why ? `<span class="muted"> · ${esc(h.why)}</span>` : ''}</span></li>`,
    )
    .join('\n');
  const title = r.item.url ? `<a href="${esc(r.item.url)}">${esc(itemLabel(r.kind, r.item))}</a>` : esc(itemLabel(r.kind, r.item));
  return `<section class="receipt">
<h3>${esc(KIND_LABEL[r.kind] ?? r.kind)}</h3>
<p class="receipt__item">${title}${r.item.title && !['post', 'episode', 'star'].includes(r.kind) ? ` <span class="muted">${esc(r.item.title.replace(new RegExp(`^${itemLabel(r.kind, r.item)}\\s*[—–-]?\\s*`), ''))}</span>` : ''}</p>
<p class="muted">${r.item.at ? `${esc(central(r.item.at))}, ${esc(age(r.age_hours))} ago` : 'undated'} · from ${esc(systemName(r.origin))}</p>
<ul class="holders">
${rows}
</ul>
</section>`;
}

function matrixTable(matrix) {
  const columns = [];
  for (const row of matrix) for (const c of row.cells) if (!columns.includes(c.system)) columns.push(c.system);
  const header = columns.map((s) => `<th>${esc(systemName(s))}</th>`).join('');
  const body = matrix
    .map((row) => {
      const cells = columns
        .map((system) => {
          const cell = row.cells.find((c) => c.system === system);
          if (!cell) return '<td class="cell cell--blank"></td>';
          const status = cell.status ?? (cell.newest ? 'fresh' : 'no-fact');
          const inner = cell.fact_error
            ? `<span class="muted">unknown</span>`
            : cell.newest
              ? `<strong>${esc(itemLabel(row.kind, cell.newest))}</strong>${cell.newest.at ? `<br><span class="muted">${esc(central(cell.newest.at))}</span>` : ''}`
              : `<span class="muted">no fact yet</span>`;
          return `<td class="cell cell--${esc(status)}">${inner}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(KIND_LABEL[row.kind] ?? row.kind)}</th>${cells}</tr>`;
    })
    .join('\n');
  return `<table class="matrix"><thead><tr><th></th>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function hopsTable(hops) {
  const seen = new Set();
  const rows = hops
    .map(
      (h) => `<tr class="status--${esc(h.status)}"${seen.has(h.id) ? '' : (seen.add(h.id), ` id="hop-${h.id}"`)}>
<td class="num"><a href="/flows/#hop-${h.id}">${h.id}</a></td>
<td><strong>${esc(systemName(h.from))}</strong> → <strong>${esc(systemName(h.to))}</strong><br><span class="muted">${esc(h.kind)}</span></td>
<td>${h.source ? `${esc(itemLabel(h.kind, h.source))}${h.measured_from && h.measured_from !== h.from ? ` <span class="muted">(as ${esc(systemName(h.measured_from))} has it)</span>` : ''}<br>${when(h.source)}` : '<span class="muted">—</span>'}</td>
<td>${h.target ? `${esc(itemLabel(h.kind, h.target))}<br>${when(h.target)}` : '<span class="muted">—</span>'}</td>
<td class="num">${h.lag_hours == null ? '<span class="muted">—</span>' : `${esc(age(h.lag_hours))}<br><span class="muted">of ${esc(age(h.expected_lag_hours))}</span>`}</td>
<td>${pill(h.status)}${h.why ? `<br><span class="muted">${esc(h.why)}</span>` : ''}</td>
</tr>`,
    )
    .join('\n');
  return `<table class="hops"><thead><tr><th>#</th><th>Hop</th><th>Source has</th><th>Destination has</th><th>Behind</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function factsList(facts) {
  const entries = [...Object.entries(facts), ...[...systemsById.keys()]
    .filter((id) => !Object.hasOwn(facts, id))
    .map((id) => [id, { none: 'No fact was available for this system in this snapshot.' }])];
  return entries
    .map(([id, fact]) => {
      const sys = systemsById.get(id);
      const state = fact.error ? pill('unknown') : fact.none && !Object.keys(fact.newest ?? {}).length ? pill('no-fact') : pill('fresh');
      const newest = Object.entries(fact.newest ?? {})
        .map(([kind, item]) => `<li><code>${esc(kind)}</code> ${esc(itemLabel(kind, item))}${item.at ? ` <span class="muted">${esc(central(item.at))}</span>` : ''}${item.url ? ` <a class="muted" href="${esc(item.url)}">↗</a>` : ''}</li>`)
        .join('');
      const extra = Object.keys(fact.extra ?? {}).length ? `<pre>${esc(JSON.stringify(fact.extra, null, 1))}</pre>` : '';
      return `<details class="fact" id="fact-${esc(id)}"><summary>${state} <strong>${esc(sys?.name ?? id)}</strong>${fact.error ? ` <span class="muted">${esc(fact.error)}</span>` : fact.none ? ` <span class="muted">${esc(fact.none)}</span>` : ''}</summary>
${sys?.fact ? `<p class="muted">${esc(sys.fact)}</p>` : ''}
${newest ? `<ul>${newest}</ul>` : ''}
${extra}
</details>`;
    })
    .join('\n');
}

/** How this run started, for the lede. */
export function triggerText(t) {
  if (!t) return 'on the half-hour clock';
  switch (t.type) {
    case 'event':
      return `on the published event for the ${esc(t.leg)} leg of ${esc(shortItem(t.kind, { id: t.id }))}${t.rehearsal ? ' (a rehearsal: nothing recorded)' : ''}`;
    case 'follow-up':
      return `${esc(String(t.minutes))} min after the ${esc(t.leg)} leg of ${esc(shortItem(t.kind, { id: t.id }))} went out`;
    case 'received':
      return `on ${esc(systemName(t.system))}'s reported arrival of ${esc(shortItem(t.kind, { id: t.id }))}`;
    case 'deploy':
      return 'by a deploy';
    case 'manual':
      return 'by hand';
    default:
      return 'on the half-hour clock';
  }
}

function journeysSection(status, journeys, history) {
  const cards = status.receipts.filter((r) => r.item && journeys?.[r.kind]).map((r) => journeyLanes(journeys[r.kind], history, status.checked_at));
  return cards.length ? '<div class="journeys">' + cards.join('\n') + '</div>' : '<p class="empty">No item is on a journey yet.</p>';
}

function storiesSection(journeys, now) {
  const recent = Object.values(journeys).filter((j) => movedThisWeek(j, now));
  return recent.length ? '<div class="stories">' + recent.map((j) => '<section class="story"><h3>' + esc(KIND_LABEL[j.kind] ?? j.kind) + '</h3><p>' + esc(storyFor(j)) + '</p></section>').join('\n') + '</div>' : '<p class="empty">No recent publication or measured arrival this week. The map below shows the latest facts.</p>';
}

function feedbinSection(fact) {
  if (!fact?.extra?.mode) return '';
  const f = fact.extra;
  return `<section class="receipt" aria-label="Feedbin to Pinboard"><h2>Feedbin → Pinboard</h2>
<p>${f.mode === 'preview' ? 'Preview: saves are off. ' : ''}<strong>${esc(f.pending)} pending</strong> · ${esc(f.confirmed)} confirmed · ${esc(f.articles_in_feed)} articles in the feed.</p>
${f.importer_error ? `<p>${esc(f.importer_error)}</p>` : ''}
<p class="muted">${f.last_import_at ? `Last import check ${esc(central(f.last_import_at))}. ` : ''}Existing bookmarks keep their notes, tags and dates. The feed does not give star times.</p></section>`;
}

export function renderPage(status, journeys = {}, history = null) {
  const s = status.summary;
  const open = status.open.length
    ? `<ul class="open">${status.open.map((h) => `<li>${pill(h.status)} <a href="#hops">${h.id}. ${esc(systemName(h.from))} → ${esc(systemName(h.to))}</a>, ${esc(h.kind)}${h.lag_hours != null ? `: ${esc(age(h.lag_hours))} behind, expected ${esc(age(h.expected_lag_hours))}` : ''}${h.why ? ` <span class="muted">${esc(h.why)}</span>` : ''}</li>`).join('\n')}</ul>`
    : '<p>Every hop with a fact on both sides is fresh or moving.</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sync state</title>
<meta name="description" content="What each of Jamie's systems holds right now, how far behind each hop runs, and a receipt for the newest item of each kind.">
<meta name="robots" content="noindex">
<link rel="alternate" type="application/json" href="/status.json">
<style>
${sharedStyles}
${pageStyles}
</style>
</head>
<body>
<main>
<header class="masthead">
<p class="kicker">Jamie Thingelstad / Sync state</p>
<h1>Things in flow</h1>
<p class="lede">The publishing pipes: what is moving, where it has arrived, and what is still waiting.</p>
<p class="checked">Checked ${esc(central(status.checked_at))}, ${triggerText(status.trigger)}. A snapshot, refreshed on events and the half-hour clock.</p>
<nav class="jump" aria-label="On this page"><a href="#map">Map</a><a href="#journeys">Journeys</a><a href="#history">History</a><a href="#receipts">Receipts</a><a href="#hops">Hop details</a></nav>
</header>
<h2>The newest stories</h2>
${storiesSection(journeys, status.checked_at)}
${feedbinSection(status.facts.feedbin)}
<ul class="counts">
<li>${pill('fresh')} ${s.fresh}</li><li>${pill('moving')} ${s.moving}</li><li>${pill('late')} ${s.late}</li><li>${pill('held')} ${s.held}</li><li>${pill('no-fact')} ${s.no_fact}</li><li>${pill('unknown')} ${s.unknown}</li>
</ul>

<h2 id="map">The map, as it is now</h2>
<p class="section-note atlas-intro">Each place says what it holds. Each road is a real connection, with the item and its status on a signpost.</p>
${status.open.length ? `<p class="atlas-attention"><span class="atlas-attention__label">Needs a look:</span><a href="#place-${esc(status.open[0].to)}">${esc(systemName(status.open[0].from))} → ${esc(systemName(status.open[0].to))}</a><span class="atlas-attention__state">${esc(status.open[0].kind)} ${pill(status.open[0].status)}</span></p>` : ''}
${atlasNavigation(status, hopSummary)}
<div class="map" tabindex="0" role="region" aria-label="Publishing atlas, scroll sideways to explore">
${mapSvg(status, journeys)}
</div>
<p class="atlas-caption">A snapshot, not continuous tracking. Geography and road length are illustrative; times come from receipts. A roof’s colour identifies its place. Choose a signpost for hop details, or a place for its facts.</p>
<details class="atlas-key"><summary>Map key: status, timing and direction</summary><p>A signpost says <strong>in 2 min</strong> only for a measured arrival; <strong>moving</strong> is within the expected lag, <strong>late</strong> is past it. Roads are coloured by the worst of their kinds. Dashed roads run on a clock; solid roads run on an event or nudge. <strong>Held</strong> is waiting by rule, <strong>no fact yet</strong> means there is no readable fact, and <strong>unknown</strong> means the reader failed. Fine lines attach signposts to roads; arrows show direction. A signpost’s link opens all its kinds below.</p></details>

<h2 id="journeys">Journeys</h2>
<p class="section-note">Each lane is time since publication, with its scale above. A circle says <strong>seen</strong> in a poll; a square says <strong>reported</strong> by an event. A dashed marker is the median from finished, measured journeys. Polls give the check interval when known; reports have one-second resolution. First confirmations have no measured lag and no time mark.</p>
${journeysSection(status, journeys, history)}

<h2 id="history">History</h2>
<p class="section-note">The last ten finished journeys of each kind, as small lanes. The archive keeps the original arrival evidence.</p>
${historyLanes(history)}

<h2>Needs a look</h2>
${open}

<h2 id="receipts">Newest of each kind</h2>
<div class="receipts">
${status.receipts.map(receiptCard).join('\n')}
</div>

<h2>What each system holds</h2>
<div class="scroll">
${matrixTable(status.matrix)}
</div>
<ul class="legend"><li>A cell is coloured by the worst hop arriving there: ${pill('fresh')} holds the source's newest, ${pill('moving')} not yet but within the expected lag, ${pill('late')} past it, ${pill('held')} waiting by rule, ${pill('no-fact')} the system publishes nothing the probe can read.</li></ul>

<h2 id="hops">Hops</h2>
<div class="scroll">
${hopsTable(status.hops)}
</div>
<p class="muted">"Behind" is how long ago the source's newest item appeared, against the lag the flows file expects for the hop. A hop measured "as X has it" has no fact at its own source, so the next system downstream stands in.</p>

<h2>Facts, as read</h2>
${factsList(status.facts)}

<footer><p>The probe runs every half hour and on every published event, then at 2, 5, 10, 15, 30, 45 and 60 minutes after each send. The <a href="/flows/">flows contract</a> explains every hop. No browser script or automatic page refresh; reload for the latest snapshot.</p>Published by the sync probe${status.code ? ` (<code>${esc(status.code)}</code>)` : ''}. The same data is at <a href="/status.json">/status.json</a>; each receipt at <code>/receipts/&lt;kind&gt;.json</code>; the current journeys at <a href="/journeys.json">/journeys.json</a>; history at <a href="/journeys/index.json">/journeys/index.json</a>; the published events, as folded, at <a href="/facts/wt-builder.json">/facts/wt-builder.json</a>. Source: <a href="https://github.com/jthingelstad/sync.thingelstad.xyz">sync.thingelstad.xyz</a>.</footer>
</main>
</body>
</html>
`;
}
