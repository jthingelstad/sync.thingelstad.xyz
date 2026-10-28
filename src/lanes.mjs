// A common linear time scale per journey, and per history group. Unknown
// arrival times have no time mark. HTML rows reflow without browser code.
import { systemName } from './flows.mjs';
import { typicalLag } from './journey.mjs';
import { central, hoursBetween } from './time.mjs';
import { duration, itemLabel, KIND_LABEL, measuredHours } from './stories.mjs';

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nonnegative = (n) => Number.isFinite(n) && n >= 0 ? n : null;
const percent = (value, horizon) => Math.max(0, Math.min(100, value / horizon * 100)).toFixed(3);

export function laneModel(journey, history, now) {
  const systems = [...new Set([...Object.keys(journey.observations ?? {}), ...Object.keys(journey.arrivals ?? {})])];
  const rows = systems.filter((system) => !journey.observations?.[system]?.label).map((system) => {
    const arrival = journey.arrivals?.[system];
    const observation = journey.observations?.[system];
    const lag = measuredHours(journey, arrival);
    const waiting = !arrival && observation?.state === 'behind';
    const elapsed = waiting ? nonnegative(hoursBetween(journey.item.at, now)) : null;
    const samples = (history?.kinds?.[journey.kind] ?? []).filter((j) => !j.active && measuredHours(j, j.arrivals?.[system]) != null).length;
    return { system, arrival, lag, typical: typicalLag(history, journey.kind, system), samples, elapsed,
      state: arrival ? lag == null ? 'unmeasured' : arrival.via ? 'reported' : 'seen' : waiting ? 'waiting' : observation?.state ?? 'no-fact' };
  });
  const greatest = Math.max(0.25, ...rows.flatMap((r) => [r.lag, r.typical, r.elapsed].filter((n) => n != null)));
  const unit = greatest <= 1 ? 0.25 : greatest <= 6 ? 1 : greatest <= 24 ? 6 : greatest <= 168 ? 24 : Math.pow(10, Math.floor(Math.log10(greatest)));
  return { rows, horizon: Math.ceil(greatest / unit) * unit };
}

function rowText(row) {
  if (row.lag != null) return `<strong>${esc(duration(row.lag))}</strong> · ${row.state} ${esc(central(row.arrival.at))}${row.arrival.resolution_seconds ? `<span class="muted"> · ${esc(duration(row.arrival.resolution_seconds / 3600))} ${row.state === 'reported' ? 'resolution' : 'check interval'}</span>` : ''}`;
  if (row.arrival) return `confirmed ${esc(central(row.arrival.at))}<span class="muted"> · arrival unmeasured</span>`;
  if (row.state === 'waiting') return `not yet${row.elapsed == null ? '' : ` · ${esc(duration(row.elapsed))} so far`}`;
  return row.state === 'unknown' ? 'reader unavailable' : 'no fact yet';
}

export function journeyLanes(journey, history, now) {
  const { rows, horizon } = laneModel(journey, history, now);
  return `<section class="journey" id="journey-${esc(journey.kind)}" data-journey="${esc(journey.kind)}">
<div class="journey__heading"><div><p class="kicker">${esc(KIND_LABEL[journey.kind] ?? journey.kind)}</p><h3>${journey.item.url ? `<a href="${esc(journey.item.url)}">${esc(itemLabel(journey.kind, journey.item))}</a>` : esc(itemLabel(journey.kind, journey.item))}</h3></div><span class="journey__origin">from ${esc(systemName(journey.origin))}</span></div>
<p class="journey__date muted">${journey.item.at ? `dated ${esc(central(journey.item.at))}` : 'publication time unknown'} · watching since ${esc(central(journey.started_at))}</p>
<div class="lane-axis" aria-hidden="true"><span>Publication</span><span>${esc(duration(horizon / 2))}</span><span>${esc(duration(horizon))}</span></div>
<ol class="lanes">${rows.map((row) => `<li class="lane lane--${row.state}">
<span class="lane__name">${esc(systemName(row.system))}</span>
<span class="lane__track" aria-hidden="true">${row.typical == null ? '' : `<span class="lane__typical" style="left:${percent(row.typical, horizon)}%"></span>`}${row.lag == null ? '' : `<span class="lane__travel" style="width:${percent(row.lag, horizon)}%"></span><span class="lane__arrival" style="left:${percent(row.lag, horizon)}%"></span>`}${row.elapsed == null ? '' : `<span class="lane__waiting" style="width:${percent(row.elapsed, horizon)}%"></span>`}${row.state === 'unmeasured' ? '<span class="lane__unmeasured">unmeasured</span>' : ''}</span>
<span class="lane__detail">${rowText(row)}${row.typical == null ? '' : `<span class="lane__baseline muted">typical ${esc(duration(row.typical))} · ${row.samples} measured ${row.samples === 1 ? 'journey' : 'journeys'}</span>`}</span>
</li>`).join('\n')}</ol>
</section>`;
}

// A key is already encoded as a single S3 component; URL encoding the key
// once more preserves its literal percent signs when CloudFront decodes it.
export function archiveUrl(key) { return `/${key.split('/').map(encodeURIComponent).join('/')}`; }

export function historyLanes(history) {
  const groups = Object.entries(history?.kinds ?? {}).map(([kind, rows]) => [kind, rows.filter((j) => !j.active).slice(0, 10)]).filter(([, rows]) => rows.length);
  if (!groups.length) return '<p class="empty">History starts with the next superseded item. A first check is not a measured journey.</p>';
  return groups.map(([kind, rows]) => {
    const systems = [...new Set(rows.flatMap((j) => Object.keys(j.arrivals ?? {})))].filter((s) => rows.some((j) => measuredHours(j, j.arrivals[s]) != null));
    const max = Math.max(0.25, ...rows.flatMap((j) => systems.map((s) => measuredHours(j, j.arrivals[s])).filter((n) => n != null)));
    return `<section class="history-group"><h3>${esc(KIND_LABEL[kind] ?? kind)}</h3><p class="muted">${rows.length} finished ${rows.length === 1 ? 'journey' : 'journeys'} · each row uses the same 0–${esc(duration(max))} scale. Only measured arrivals have ticks.</p>
<ol class="history-rows">${rows.map((j) => `<li class="history-row"><div class="history-row__item"><a href="${esc(archiveUrl(j.archive))}">${esc(itemLabel(kind, j.item))}</a><span class="muted">${esc(central(j.item.at ?? j.started_at))}</span></div><div class="history-row__lanes">${systems.map((system) => {
      const lag = measuredHours(j, j.arrivals[system]);
      return `<div class="mini-lane"><span>${esc(systemName(system))}</span><span class="mini-lane__track" aria-hidden="true">${lag == null ? '' : `<span style="left:${percent(lag, max)}%"></span>`}</span><span>${lag == null ? 'unmeasured' : esc(duration(lag))}</span></div>`;
    }).join('')}${systems.length ? '' : '<span class="muted">No measured arrival yet.</span>'}</div></li>`).join('')}</ol></section>`;
  }).join('\n');
}
