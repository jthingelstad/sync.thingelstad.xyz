// Native receipt, inventory and connection evidence, shared by the guide pages.
import { systemName, systemsById } from './flows.mjs';
import { itemLabel, KIND_LABEL } from './stories.mjs';
import { shortItem } from './map.mjs';
import { age, central } from './time.mjs';
import { landmark } from './folio.mjs';
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATUS_LABEL = { fresh: 'fresh', moving: 'moving', late: 'late', held: 'held', 'no-fact': 'no fact yet', unknown: 'unknown' };
const HOLDER_LABEL = { has: 'has it', behind: 'behind', 'no-fact': 'no fact yet', unknown: 'unknown' };

const pill = (status) => `<span class="pill pill--${esc(status)}">${esc(STATUS_LABEL[status] ?? status)}</span>`;

const when = (item) => (item?.at ? `<span class="muted">${esc(central(item.at))}</span>` : '');

export function receiptCard(r) {
  if (!r.item) {
    return `<section class="receipt"><h3>${landmark(r.origin, 'receipt-art')}${esc(KIND_LABEL[r.kind] ?? r.kind)}</h3><p class="muted">No system publishes a fact for the newest ${esc(r.kind)} yet.</p></section>`;
  }
  const rows = r.holders
    .map(
      (h) => `<li class="holder holder--${esc(h.state)}"><span class="holder__mark" aria-hidden="true"></span><span class="holder__name">${esc(systemName(h.system))}${h.label ? ` <span class="muted">(${esc(h.label)})</span>` : ''}</span><span class="holder__state">${esc(HOLDER_LABEL[h.state])}${h.state === 'behind' && h.newest ? `: ${esc(itemLabel(h.kind, h.newest))}` : ''}${h.state !== 'has' && h.why ? `<span class="muted"> · ${esc(h.why)}</span>` : ''}</span></li>`,
    )
    .join('\n');
  const title = r.item.url ? `<a href="${esc(r.item.url)}">${esc(itemLabel(r.kind, r.item))}</a>` : esc(itemLabel(r.kind, r.item));
  return `<section class="receipt">
<h3>${landmark(r.origin, 'receipt-art')}${esc(KIND_LABEL[r.kind] ?? r.kind)}</h3>
<p class="receipt__item">${title}${r.item.title && !['post', 'episode', 'star'].includes(r.kind) ? ` <span class="muted">${esc(r.item.title.replace(new RegExp(`^${itemLabel(r.kind, r.item)}\\s*[—–-]?\\s*`), ''))}</span>` : ''}</p>
<p class="muted">${r.item.at ? `${esc(central(r.item.at))}, ${esc(age(r.age_hours))} ago` : 'undated'} · from ${esc(systemName(r.origin))}</p>
<ul class="holders">
${rows}
</ul>
</section>`;
}

export function matrixTable(matrix) {
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

export function hopsTable(hops) {
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

export function factsList(facts) {
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
      return `<details class="fact" id="fact-${esc(id)}"><summary>${state} ${landmark(id, 'fact-art')}<strong>${esc(sys?.name ?? id)}</strong>${fact.error ? ` <span class="muted">${esc(fact.error)}</span>` : fact.none ? ` <span class="muted">${esc(fact.none)}</span>` : ''}</summary>
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

