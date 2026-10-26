// The sync page: one scriptless HTML page from a status. Facts only, so it
// is fine to publish: newest ids and ages, never a secret, never a visitor.
import { systemName, systemsById } from './flows.mjs';
import { age, central } from './time.mjs';

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
  const rows = hops
    .map(
      (h) => `<tr class="status--${esc(h.status)}">
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

export function renderPage(status) {
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
@media (max-width: 40rem) { body { font-size: 15px; } table { font-size: 13.5px; } th, td { padding: 8px 6px; } }
</style>
</head>
<body>
<main>
<h1>Sync state</h1>
<p class="lede">What each of Jamie's systems holds right now, how far behind each hop runs, and a receipt for the newest item of each kind. Checked ${esc(central(status.checked_at))}; the probe runs every half hour. The map of the hops is at <a href="/flows/">/flows/</a>.</p>
<ul class="counts">
<li>${pill('fresh')} ${s.fresh}</li><li>${pill('moving')} ${s.moving}</li><li>${pill('late')} ${s.late}</li><li>${pill('held')} ${s.held}</li><li>${pill('no-fact')} ${s.no_fact}</li><li>${pill('unknown')} ${s.unknown}</li>
</ul>

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

<footer>Published by the sync probe${status.code ? ` (<code>${esc(status.code)}</code>)` : ''}. The same data is at <a href="/status.json">/status.json</a>; each receipt at <code>/receipts/&lt;kind&gt;.json</code>. Source: <a href="https://github.com/jthingelstad/sync.thingelstad.xyz">sync.thingelstad.xyz</a>.</footer>
</main>
</body>
</html>
`;
}
