import { central } from './time.mjs';

const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const time = value => value ? `<time datetime="${esc(value)}">${esc(central(value))}</time>` : 'No recorded time';
const labels = { present: 'Verified present', pending: 'Waiting for evidence', unknown: 'Check unavailable' };

export function bookmarkBatchLink(batch) {
  if (!batch) return '';
  const text = batch.state === 'unknown' ? 'Public bookmark batch · check unavailable'
    : `Public bookmark batch · ${batch.rows.filter(r => r.state !== 'present').length} items need more evidence · ${batch.rows.length} public items checked`;
  return `<a href="/journeys/#bookmark-batch">${esc(text)} →</a>`;
}

function nextStep(row) {
  if (row.state === 'present') return 'No action needed for this item in this snapshot.';
  if (row.record.state === 'mismatch') return 'Check the Links publisher output: the public record does not match this bookmark id and exact URL.';
  if (row.record.state === 'unknown') return 'Repeat the public record check or inspect the Links publisher run. A reader failure does not establish a missing record.';
  if (row.record.state === 'deferred') return 'The runtime budget deferred public readback. Check again after the next observation.';
  if (row.association.state === 'unknown') return 'Read the Links public fact again before deciding whether the star association is missing.';
  if (!row.captured_at) return 'Check the Sync capture producer on its next half-hour clock; no durable capture time is recorded for this item.';
  if (row.acknowledgement.state === 'pending') return 'Inspect the Links publisher run and the next public readback; the current fact has not acknowledged this capture.';
  if (row.record.state === 'absent') return 'The public record answered 404. Inspect the Links publisher output and verify a subsequent public readback before resolving this item.';
  return 'The public record exists, but its star association is absent from the Links fact. Inspect the publisher association output and verify both again.';
}

function item(row) {
  const record = { present: 'Exact public record verified', absent: 'Public record answered 404', unknown: 'Public record reader failed', mismatch: 'Public record identity mismatch', deferred: 'Public record check deferred' }[row.record.state];
  const acknowledgement = { acknowledged: 'Publisher acknowledged capture', pending: 'Capture not acknowledged', unknown: 'Acknowledgement reader unavailable' }[row.acknowledgement.state];
  const association = { present: 'Matching star association listed', absent: 'Star association absent', unknown: 'Association reader unavailable' }[row.association.state];
  return `<details class="bookmark-row" data-batch-state="${row.state}"><summary><span>${esc(row.title)}</span><strong>${labels[row.state]}</strong></summary>
<p><a href="${esc(row.url)}">Source article ↗</a> · <code>${esc(row.id)}</code>${row.record.state === 'present' ? ` · <a href="https://links.thingelstad.xyz/links/${esc(row.id)}/">Public bookmark ↗</a>` : ''}</p>
<dl class="bookmark-stages"><div><dt>First observed in Feedbin</dt><dd>${time(row.first_observed_at)}</dd></div>
<div><dt>Pinboard save confirmed</dt><dd>${time(row.pinboard_confirmed_at)}</dd></div>
<div><dt>Currently public in Pinboard</dt><dd>Verified ${time(row.public_checked_at)}</dd></div>
<div><dt>Durable capture recorded</dt><dd>${time(row.captured_at)}</dd></div>
<div><dt>${acknowledgement}</dt><dd>Checked ${time(row.acknowledgement.checked_at)} · <a href="${esc(row.acknowledgement.evidence_url)}">Publisher fact</a></dd></div>
<div><dt>${record}</dt><dd>${row.record.checked_at ? `Checked ${time(row.record.checked_at)} · ` : ''}<a href="${esc(row.record.evidence_url)}">Exact record JSON</a></dd></div>
<div><dt>${association}</dt><dd>Checked ${time(row.association.checked_at)} · <a href="${esc(row.association.evidence_url)}">Association fact</a></dd></div></dl>
<p class="bookmark-action"><strong>Next step:</strong> ${esc(nextStep(row))} <a href="/records/#action-23-star">Connection guidance →</a></p></details>`;
}

export function bookmarkBatch(batch) {
  if (!batch) return '';
  if (batch.state === 'unknown') return `<section class="bookmark-batch" id="bookmark-batch"><h2>Public bookmark batch</h2><p>${esc(batch.note)}</p></section>`;
  const present = batch.rows.filter(r => r.state === 'present').length;
  return `<section class="bookmark-batch" id="bookmark-batch" tabindex="-1"><h2>Public bookmark batch</h2>
<p>Feedbin → Pinboard → Linking Things. ${batch.rows.length} public items shown: ${present} verified, ${batch.rows.length - present} need more evidence. Checked ${time(batch.checked_at)}.</p>
<p class="evidence-note">A bounded check of ${batch.selected} of ${batch.candidates} confirmed-save candidates; ${batch.omitted} not selected. Up to ${batch.limit} per snapshot, with known unresolved items first and other candidates rotating. This is not a complete account audit. The newest-item journey above keeps its own receipt.</p>
${batch.rows.map(item).join('')}${batch.rows.length ? '' : '<p>No item passed a current public-source check in this sample.</p>'}
<p class="evidence-note">${batch.not_public} selected sources were private or no longer present; ${batch.source_unavailable} source checks failed; ${batch.deferred} were deferred by the runtime budget. These sources expose no item identity here. Public-source checks are repeated each snapshot; withdrawn items disappear on the next successful publication, with up to one minute of page caching.</p>
<p class="evidence-note">First observation is not a star time. Article publication dates never start a timer. Capture acknowledgement is not public arrival; record and association checks above are observations, not historical arrival timestamps. <a href="/records/#action-22-star">Import guidance →</a></p></section>`;
}
