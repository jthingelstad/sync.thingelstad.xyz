// The sync page: one scriptless HTML page from a status. Facts only, so it
// is fine to publish: newest ids and ages, never a secret, never a visitor.
import { systemName, systemsById } from './flows.mjs';
import { lagAt } from './journey.mjs';
import { mapSvg, shortItem } from './map.mjs';
import { age, central, hoursBetween } from './time.mjs';

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATUS_LABEL = { fresh: 'fresh', moving: 'moving', late: 'late', held: 'held', 'no-fact': 'no fact yet', unknown: 'unknown' };
const HOLDER_LABEL = { has: 'has it', behind: 'behind', 'no-fact': 'no fact yet', unknown: 'unknown' };
const KIND_LABEL = { issue: 'Weekly Thing issue', post: 'Blog post', link: 'Saved link', episode: 'Podcast episode', audio: 'Audio edition' };

const pill = (status) => `<span class="pill pill--${esc(status)}">${esc(STATUS_LABEL[status] ?? status)}</span>`;

/** How an item reads: "WT354", a post's title, a link's time. */
export function itemLabel(kind, item) {
  if (!item) return '';
  if (kind === 'issue' || kind === 'audio') return /^\d+$/.test(String(item.id)) ? `WT${item.id}` : String(item.id);
  if (kind === 'link') return item.at ? `saved ${central(item.at)}` : String(item.id);
  return item.title ?? String(item.id);
}

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
<p class="receipt__item">${title}${r.item.title && r.kind !== 'post' && r.kind !== 'episode' ? ` <span class="muted">${esc(r.item.title.replace(new RegExp(`^${itemLabel(r.kind, r.item)}\\s*[—–-]?\\s*`), ''))}</span>` : ''}</p>
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
  return `<table><thead><tr><th>#</th><th>Hop</th><th>Source has</th><th>Destination has</th><th>Behind</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function factsList(facts) {
  return Object.entries(facts)
    .map(([id, fact]) => {
      const sys = systemsById.get(id);
      const state = fact.error ? pill('unknown') : fact.none && !Object.keys(fact.newest ?? {}).length ? pill('no-fact') : pill('fresh');
      const newest = Object.entries(fact.newest ?? {})
        .map(([kind, item]) => `<li><code>${esc(kind)}</code> ${esc(itemLabel(kind, item))}${item.at ? ` <span class="muted">${esc(central(item.at))}</span>` : ''}${item.url ? ` <a class="muted" href="${esc(item.url)}">↗</a>` : ''}</li>`)
        .join('');
      const extra = Object.keys(fact.extra ?? {}).length ? `<pre>${esc(JSON.stringify(fact.extra, null, 1))}</pre>` : '';
      return `<details class="fact"><summary>${state} <strong>${esc(sys?.name ?? id)}</strong>${fact.error ? ` <span class="muted">${esc(fact.error)}</span>` : fact.none ? ` <span class="muted">${esc(fact.none)}</span>` : ''}</summary>
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
    case 'deploy':
      return 'by a deploy';
    case 'manual':
      return 'by hand';
    default:
      return 'on the half-hour clock';
  }
}

/** The journey of each kind's newest item: when the probe first saw each system holding it. */
function journeysSection(status, journeys) {
  const cards = status.receipts
    .filter((r) => r.item && journeys?.[r.kind])
    .map((r) => {
      const j = journeys[r.kind];
      const rows = r.holders
        .filter((h) => !h.label)
        .map((h) => {
          const arrival = j.arrivals?.[h.system];
          let text;
          let state;
          if (arrival?.observed) {
            const lag = lagAt(j, h.system);
            text = `${esc(central(arrival.at))}${lag == null ? '' : `, <strong>${esc(age(lag))}</strong> after it went out`}`;
            state = 'seen';
          } else if (arrival) {
            text = `already there when the page started watching, ${esc(central(arrival.at))}`;
            state = 'had';
          } else if (h.state === 'unknown') {
            text = 'unknown';
            state = 'unknown';
          } else if (h.state === 'no-fact') {
            text = 'no fact yet';
            state = 'no-fact';
          } else {
            text = `not yet${j.item.at ? `, <strong>${esc(age(hoursBetween(j.item.at, status.checked_at)))}</strong> so far` : ''}`;
            state = 'waiting';
          }
          return `<li class="step step--${state}"><span class="step__mark" aria-hidden="true"></span><span class="step__name">${esc(systemName(h.system))}</span><span class="step__when">${text}</span></li>`;
        })
        .join('\n');
      const title = j.item.url ? `<a href="${esc(j.item.url)}">${esc(itemLabel(r.kind, j.item))}</a>` : esc(itemLabel(r.kind, j.item));
      return `<section class="journey">
<h3>${esc(KIND_LABEL[r.kind] ?? r.kind)}</h3>
<p class="receipt__item">${title}</p>
<p class="muted">${j.item.at ? `out ${esc(central(j.item.at))} from ${esc(systemName(j.origin))}` : `from ${esc(systemName(j.origin))}, undated`}; watched since ${esc(central(j.started_at))}</p>
<ul class="steps">
${rows}
</ul>
</section>`;
    });
  return cards.length ? `<div class="receipts">\n${cards.join('\n')}\n</div>` : '<p class="muted">No item is on a journey yet.</p>';
}

export function renderPage(status, journeys = {}) {
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
:root {
  --bg: #ffffff; --ink: #16161a; --muted: #5a5a66; --line: #e2e2e8; --soft: #f3f3f5;
  --fresh: #1d7348; --moving: #1a5eb6; --late: #b3123f; --held: #b5461a; --nofact: #8a8a96; --unknown: #b5461a;
  --fresh-soft: #e6f4ec; --moving-soft: #e8eefc; --late-soft: #fde8ef; --held-soft: #fbe9df; --nofact-soft: #f3f3f5;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1e1e23; --ink: #ececf0; --muted: #9d9daa; --line: #34343c; --soft: #26262c;
    --fresh: #74d3a0; --moving: #78acf2; --late: #f58aa3; --held: #f3a274; --nofact: #9d9daa; --unknown: #f3a274;
    --fresh-soft: #27402f; --moving-soft: #27324a; --late-soft: #4a2836; --held-soft: #4a3328; --nofact-soft: #26262c;
  }
}
:root[data-theme="dark"] {
  --bg: #1e1e23; --ink: #ececf0; --muted: #9d9daa; --line: #34343c; --soft: #26262c;
  --fresh: #74d3a0; --moving: #78acf2; --late: #f58aa3; --held: #f3a274; --nofact: #9d9daa; --unknown: #f3a274;
  --fresh-soft: #27402f; --moving-soft: #27324a; --late-soft: #4a2836; --held-soft: #4a3328; --nofact-soft: #26262c;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1120px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 1.9rem; line-height: 1.15; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 1.25rem; margin: 44px 0 12px; }
h3 { font-size: 1rem; margin: 0 0 4px; }
p { margin: 0 0 10px; }
a { color: inherit; }
.muted { color: var(--muted); }
.lede { color: var(--muted); max-width: 70ch; }
.counts { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 14px 0 0; padding: 0; list-style: none; font-size: 14.5px; }
.pill { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; padding: 1px 8px; border-radius: 999px; color: var(--bg); background: var(--nofact); white-space: nowrap; }
.pill--fresh { background: var(--fresh); } .pill--moving { background: var(--moving); } .pill--late { background: var(--late); } .pill--held { background: var(--held); } .pill--unknown { background: var(--unknown); }
.open { padding-left: 20px; } .open li { margin: 0 0 8px; }
.receipts { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.receipt { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.receipt__item { font-size: 1.1rem; font-weight: 600; margin: 0 0 2px; }
.holders { list-style: none; padding: 0; margin: 10px 0 0; font-size: 14.5px; }
.holder { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; border-top: 1px solid var(--line); }
.holder__mark { width: 10px; height: 10px; border-radius: 50%; background: var(--nofact); flex: none; position: relative; top: 1px; }
.holder--has .holder__mark { background: var(--fresh); } .holder--behind .holder__mark { background: var(--late); } .holder--unknown .holder__mark { background: var(--unknown); }
.holder__name { flex: 1; font-weight: 600; } .holder__state { text-align: right; }
.scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--line); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
th, td { text-align: left; vertical-align: top; padding: 10px 10px; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
thead th { font-size: 12.5px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--muted); border-top: 0; }
tbody th { font-weight: 600; white-space: nowrap; }
td.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.matrix td.cell { min-width: 9rem; }
.cell--fresh { background: var(--fresh-soft); } .cell--moving { background: var(--moving-soft); } .cell--late { background: var(--late-soft); } .cell--held { background: var(--held-soft); } .cell--no-fact { background: var(--nofact-soft); }
.cell--unknown { background: var(--held-soft); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 10px 0 0; padding: 0; list-style: none; font-size: 14px; color: var(--muted); }
.fact { border-top: 1px solid var(--line); padding: 8px 0; } .fact summary { cursor: pointer; } .fact ul { margin: 6px 0; padding-left: 20px; }
pre { font-size: 12.5px; background: var(--soft); padding: 8px 10px; border-radius: 6px; overflow-x: auto; }
code { font-size: 0.92em; background: var(--soft); padding: 1px 5px; border-radius: 4px; }
footer { margin-top: 48px; font-size: 14px; color: var(--muted); }
.journey { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.steps { list-style: none; padding: 0; margin: 10px 0 0; font-size: 14.5px; }
.step { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; border-top: 1px solid var(--line); }
.step__mark { width: 10px; height: 10px; border-radius: 50%; background: var(--nofact); flex: none; position: relative; top: 1px; }
.step--seen .step__mark { background: var(--fresh); } .step--had .step__mark { background: var(--fresh); opacity: 0.5; } .step--waiting .step__mark { background: var(--moving); } .step--unknown .step__mark { background: var(--unknown); }
.step__name { flex: 1; font-weight: 600; } .step__when { text-align: right; }
.map { margin: 12px calc(50% - 50vw) 0; padding: 0 16px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.map svg { display: block; margin: 0 auto; --pele-bg: var(--bg); --pele-fg: var(--ink); --pele-muted: var(--muted); --pele-line: var(--nofact); --pele-surface: var(--soft); --pele-surface-alt: var(--soft); --pele-border: var(--muted); --pele-radius: 6px; --pele-font: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
.map .pele-edge path { stroke-width: 1.75; }
.map .pele-edge.hop--fresh path { stroke: var(--fresh); } .map .pele-edge.hop--fresh .pele-marker { fill: var(--fresh); }
.map .pele-edge.hop--moving path { stroke: var(--moving); } .map .pele-edge.hop--moving .pele-marker { fill: var(--moving); }
.map .pele-edge.hop--late path { stroke: var(--late); stroke-width: 2.5; } .map .pele-edge.hop--late .pele-marker { fill: var(--late); }
.map .pele-edge.hop--held path { stroke: var(--held); } .map .pele-edge.hop--held .pele-marker { fill: var(--held); }
.map .pele-edge.hop--unknown path { stroke: var(--unknown); } .map .pele-edge.hop--unknown .pele-marker { fill: var(--unknown); }
.map .pele-edge-label rect { fill: var(--nofact-soft); stroke: var(--line); }
.map .pele-edge-label text { font-weight: 600; fill: var(--ink); }
.map .pele-edge-label.hop--fresh rect { fill: var(--fresh-soft); stroke: var(--fresh); }
.map .pele-edge-label.hop--moving rect { fill: var(--moving-soft); stroke: var(--moving); }
.map .pele-edge-label.hop--late rect { fill: var(--late-soft); stroke: var(--late); }
.map .pele-edge-label.hop--held rect { fill: var(--held-soft); stroke: var(--held); }
.map .pele-edge-label.hop--unknown rect { fill: var(--held-soft); stroke: var(--unknown); }
.map .pele-edge-label a:hover text, .map .pele-edge-label a:focus-visible text { text-decoration: underline; }
.map .pele-node rect { fill: var(--soft); stroke: var(--ink); stroke-width: 1.25; }
.map .pele-node.node--no-fact rect { stroke: var(--nofact); stroke-dasharray: 4 3; }
.map .pele-node.node--no-fact .pele-label { fill: var(--muted); }
.map .pele-node.node--unknown rect { stroke: var(--unknown); stroke-dasharray: 4 3; }
@media (max-width: 40rem) { body { font-size: 15px; } table { font-size: 13.5px; } th, td { padding: 8px 6px; } }
</style>
</head>
<body>
<main>
<h1>Sync state</h1>
<p class="lede">What each of Jamie's systems holds right now, how far behind each hop runs, and a receipt for the newest item of each kind. Checked ${esc(central(status.checked_at))}, ${triggerText(status.trigger)}. The probe runs every half hour and on every <code>published</code> event WT Builder puts on the publishing bus, then again at 2, 5, 10, 15, 30, 45 and 60 minutes to watch the item move. What each hop moves, and how, is at <a href="/flows/">/flows/</a>.</p>
<ul class="counts">
<li>${pill('fresh')} ${s.fresh}</li><li>${pill('moving')} ${s.moving}</li><li>${pill('late')} ${s.late}</li><li>${pill('held')} ${s.held}</li><li>${pill('no-fact')} ${s.no_fact}</li><li>${pill('unknown')} ${s.unknown}</li>
</ul>

<h2>The map, as it is now</h2>
<p class="muted">Each box is a system and what it holds; each hop carries the item on it and how it is doing: <strong>in 2 min</strong> is a measured arrival, <strong>moving</strong> is on its way within the expected lag, <strong>late</strong> is past it. A hop is coloured by the worst of the kinds it moves; a dashed hop runs on a clock, a solid one live or on a nudge. A dashed box publishes no fact yet. The map scrolls sideways; a hop's label opens its rows below.</p>
<div class="map">
${mapSvg(status, journeys)}
</div>

<h2>Journeys</h2>
<p class="muted">The newest item of each kind, and when the probe first saw each system holding it. A time in bold is measured: the system did not have the item on one run and had it on the next.</p>
${journeysSection(status, journeys)}

<h2>Needs a look</h2>
${open}

<h2>Newest of each kind</h2>
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

<footer>Published by the sync probe${status.code ? ` (<code>${esc(status.code)}</code>)` : ''}. The same data is at <a href="/status.json">/status.json</a>; each receipt at <code>/receipts/&lt;kind&gt;.json</code>; the journeys at <a href="/journeys.json">/journeys.json</a>; the published events, as folded, at <a href="/facts/wt-builder.json">/facts/wt-builder.json</a>. Source: <a href="https://github.com/jthingelstad/sync.thingelstad.xyz">sync.thingelstad.xyz</a>.</footer>
</main>
</body>
</html>
`;
}
