// Native receipt, inventory and connection evidence, shared by the guide pages.
import { systemName, systemsById } from './flows.mjs';
import { itemLabel, KIND_LABEL } from './stories.mjs';
import { shortItem } from './map.mjs';
import { age, central } from './time.mjs';
import { landmark } from './folio.mjs';
import { coverageModel, COVERAGE_LABEL, nextAction } from './coverage.mjs';
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

const recordedTime = (at) => at && Number.isFinite(Date.parse(at))
  ? `<time datetime="${esc(at)}">${esc(central(at))}</time>` : 'no recorded check time';
const coverageCounts = (model) => `${model.comparable} of ${model.total} checks have comparable evidence · ${model.unobserved} unobserved · ${model.unavailable} reader unavailable`;

export function coverageSummary(status, model = coverageModel(status)) {
  return `<aside class="coverage-summary" aria-label="Monitoring coverage"><strong>Monitoring coverage</strong><span>${coverageCounts(model)}</span><a href="/records/#coverage">Review coverage →</a></aside>`;
}

export function coverageLedger(status, model = coverageModel(status)) {
  const groups = [['unavailable', 'Readers to inspect'], ['unobserved', 'Evidence to establish'], ['comparable', 'Checks with comparable evidence']];
  return `<h2>Monitoring coverage</h2><p class="coverage-totals">${coverageCounts(model)}</p>
<p class="evidence-note">One check is one connection and content kind: ${model.total} checks across ${model.connections} connections. Comparable evidence can show fresh, moving, late or held. It is not a count of successful deliveries.</p>
<p class="evidence-note">${model.kinds} checks have no comparison for their content kind; ${model.endpoints} lack readable endpoint facts.${model.results ? ` ${model.results} have no complete recorded result.` : ''} These are visibility gaps, not confirmed missing data. The probe follows the newest exposed identities, not every item in a batch or every metadata edit.</p>
<p class="evidence-note">Snapshot checked ${recordedTime(status.checked_at)}. A named fallback witness may stand in for a source with no fact.</p>
${groups.filter(([state]) => model[state]).map(([state, title]) => `<details class="coverage-group"${state === 'comparable' ? '' : ' open'}><summary>${esc(title)} · ${model[state]}</summary><ul class="coverage-rows">${model.checks.filter((c) => c.state === state).map((c) => `<li data-coverage="${c.state}" data-hop="${c.hop.id}" data-kind="${esc(c.kind)}"><a href="#action-${c.hop.id}-${esc(c.kind)}"><strong>${c.hop.id} · ${esc(systemName(c.hop.from))} → ${esc(systemName(c.hop.to))}</strong><span>${esc(KIND_LABEL[c.kind] ?? c.kind)}</span></a><div><strong>${esc(COVERAGE_LABEL[c.state])}</strong><span>${c.row ? esc(STATUS_LABEL[c.row.status] ?? c.row.status) : 'No recorded result'}${c.witness ? ` · source witness: ${esc(systemName(c.witness))}` : ''}</span><span>${esc(nextAction(c).title)}</span></div></li>`).join('')}</ul></details>`).join('')}`;
}

function evidencePoint(point, role, kind) {
  const value = point.absent ? 'Explicit absence recorded for this item' : point.item ? itemLabel(kind, point.item) : `No readable ${kind} fact`;
  return `<li><a href="#fact-${esc(point.system)}">${esc(role)} · ${esc(systemName(point.system))}</a><span>${esc(value)}</span><span>Evidence checked ${recordedTime(point.checked_at)}</span></li>`;
}

export function connectionActions(hop, status, checks) {
  const trigger = hop.trigger;
  const zone = trigger?.tz === 'America/Chicago' ? ' (US Central)' : trigger?.tz ? ` (${trigger.tz})` : '';
  const timing = trigger?.type === 'clock' && trigger.schedule ? `Recorded schedule: ${trigger.schedule}${zone}.`
    : trigger?.event ? `Recorded trigger: ${trigger.event}.` : trigger?.type === 'live' ? 'Read on demand.' : 'No trigger detail is recorded.';
  const runner = [trigger?.runs_on, trigger?.runner].filter(Boolean).join(' · ');
  return `<section class="connection-actions" aria-labelledby="actions-${hop.id}"><h3 id="actions-${hop.id}">What to do next</h3>
${checks.map((c) => {
  const action = nextAction(c);
  return `<article class="check-action" id="action-${hop.id}-${esc(c.kind)}" tabindex="-1"><h4>${esc(KIND_LABEL[c.kind] ?? c.kind)} · ${esc(action.title)}</h4><p>${esc(action.detail)}</p>
${c.row?.why ? `<p class="evidence-note">Recorded result: ${esc(c.row.why)}</p>` : ''}
${c.witness ? `<p class="evidence-note">No direct source fact from ${esc(systemName(hop.from))}; this comparison uses ${esc(systemName(c.witness))}.</p>` : ''}
<ul class="check-evidence">${evidencePoint(c.source, c.witness ? 'Source witness' : 'Source', c.kind)}${evidencePoint(c.destination, 'Destination', c.kind)}</ul>
${c.row?.reported_at ? `<p class="evidence-note">Arrival reported ${recordedTime(c.row.reported_at)}.</p>` : ''}</article>`;
}).join('')}
<dl class="operation-record"><dt>When it runs</dt><dd>${esc(timing)}${runner ? ` Runner: ${esc(runner)}.` : ''}</dd>
<dt>Recorded operation</dt><dd>${esc(hop.mechanism || 'No operation is recorded.')}</dd>
<dt>How to verify</dt><dd>${esc(hop.verify || 'No verification contract is recorded.')}</dd>
${hop.hold ? `<dt>Recorded hold</dt><dd>${esc(hop.hold)}</dd>` : ''}</dl>
<p class="evidence-note">Snapshot checked ${recordedTime(status.checked_at)}. Guidance describes this snapshot; it does not run a worker or repair data. The flows contract supplies the operation and verification steps.</p>
</section>`;
}

/** How this run started, for the lede. */
export function triggerText(t) {
  if (!t) return 'on the half-hour clock';
  switch (t.type) {
    case 'event':
      return `on the published event for the ${esc(t.leg)} leg of ${esc(shortItem(t.kind, { id: t.id }))}${t.rehearsal ? ' (a rehearsal: nothing recorded)' : ''}`;
    case 'follow-up':
      return `on the ${esc(String(t.minutes))} min follow-up for the ${esc(t.leg)} leg of ${esc(shortItem(t.kind, { id: t.id }))}`;
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

