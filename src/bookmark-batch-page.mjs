import { central } from './time.mjs';

const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const time = value => value ? `<time datetime="${esc(value)}">${esc(central(value))}</time>` : 'No recorded time';
const labels = { present: 'Verified present', pending: 'Waiting for evidence', unknown: 'Check unavailable' };
const noteLabels = { match: 'Notes match', empty: 'No note on either record', different: 'Notes differ', missing: 'Note field missing in Links', unreadable: 'Note comparison unavailable', absent: 'Note not compared · record answered 404', mismatch: 'Note not compared · record identity mismatch', deferred: 'Note comparison deferred' };
const noteLabel = row => noteLabels[row.note?.state] ?? 'Note comparison not recorded';
const noteCounts = rows => {
  const count = state => rows.filter(r => r.note?.state === state).length;
  const match = count('match'), empty = count('empty'), different = count('different');
  return { match, empty, different, unavailable: rows.length - match - empty - different };
};

export function bookmarkBatchLink(batch) {
  if (!batch) return '';
  const notes = noteCounts(batch.rows ?? []);
  const text = batch.state === 'unknown' ? 'Public bookmark batch · check unavailable'
    : `Public bookmark batch · ${batch.rows.filter(r => r.state !== 'present').length} current items need presence evidence${notes.different ? ` · ${notes.different} note${notes.different === 1 ? ' differs' : 's differ'}` : ''}${notes.unavailable ? ` · ${notes.unavailable} note comparison${notes.unavailable === 1 ? '' : 's'} unavailable` : ''}${batch.progress?.follow_up_not_checked ? ` · ${batch.progress.follow_up_not_checked} follow-up${batch.progress.follow_up_not_checked === 1 ? '' : 's'} not checked` : ''}${batch.source_unavailable ? ` · ${batch.source_unavailable} source check${batch.source_unavailable === 1 ? '' : 's'} unavailable` : ''}${batch.deferred ? ` · ${batch.deferred} deferred` : ''} · ${batch.rows.length} public items checked`;
  return `<a href="/journeys/#bookmark-batch">${esc(text)} →</a>`;
}

function nextStep(row) {
  if (row.state === 'present') {
    if (row.note?.state === 'different') return 'The current notes differ. Inspect the next nightly Pinboard mirror in Links, then compare the exact public record again. A capture acknowledgement does not verify a later note edit.';
    if (row.note?.state === 'missing') return 'The exact Links record has no note field. Inspect the record schema and mirror output; a missing field does not establish an empty or stale note.';
    if (!['match', 'empty'].includes(row.note?.state)) return 'The record and association are present, but note parity is unverified. Repeat the note comparison before deciding whether the note is stale.';
    return 'No action needed for this item in this snapshot.';
  }
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
  const note = row.note;
  return `<details class="bookmark-row" data-batch-state="${row.state}" data-note-state="${esc(note?.state ?? 'unknown')}"><summary><span>${esc(row.title)}</span><strong>${labels[row.state]} · ${noteLabel(row)}</strong></summary>
<p><a href="${esc(row.url)}">Source article ↗</a> · <code>${esc(row.id)}</code>${row.record.state === 'present' ? ` · <a href="https://links.thingelstad.xyz/links/${esc(row.id)}/">Public bookmark ↗</a>` : ''}</p>
<dl class="bookmark-stages"><div><dt>First observed in Feedbin</dt><dd>${time(row.first_observed_at)}</dd></div>
<div><dt>Pinboard save confirmed</dt><dd>${time(row.pinboard_confirmed_at)}</dd></div>
<div><dt>Currently public in Pinboard</dt><dd>Verified ${time(row.public_checked_at)}</dd></div>
<div><dt>Durable capture recorded</dt><dd>${time(row.captured_at)}</dd></div>
<div><dt>${acknowledgement}</dt><dd>Checked ${time(row.acknowledgement.checked_at)} · <a href="${esc(row.acknowledgement.evidence_url)}">Publisher fact</a></dd></div>
<div><dt>${record}</dt><dd>${row.record.checked_at ? `Checked ${time(row.record.checked_at)} · ` : ''}<a href="${esc(row.record.evidence_url)}">Exact record JSON</a></dd></div>
<div><dt>${association}</dt><dd>Checked ${time(row.association.checked_at)} · <a href="${esc(row.association.evidence_url)}">Association fact</a></dd></div>
<div><dt>${noteLabel(row)}</dt><dd>${note ? `Pinboard checked ${time(note.source_checked_at)} · ${note.destination_checked_at ? `Links checked ${time(note.destination_checked_at)}` : 'No destination note check'}` : 'No recorded note comparison time'}</dd></div></dl>
<p class="bookmark-action"><strong>Next step:</strong> ${esc(nextStep(row))} <a href="/records/#action-${row.state === 'present' && !['match', 'empty'].includes(note?.state) ? '5-note' : '23-star'}">Connection guidance →</a></p></details>`;
}

export function bookmarkBatch(batch) {
  if (!batch) return '';
  if (batch.state === 'unknown') return `<section class="bookmark-batch" id="bookmark-batch"><h2>Public bookmark batch</h2><p>${esc(batch.note)}</p></section>`;
  const present = batch.rows.filter(r => r.state === 'present').length;
  const notes = noteCounts(batch.rows);
  return `<section class="bookmark-batch" id="bookmark-batch" tabindex="-1"><h2>Public bookmark batch</h2>
<p>Feedbin → Pinboard → Linking Things. ${batch.rows.length} public items shown: ${present} records and star associations verified, ${batch.rows.length - present} need presence evidence. Checked ${time(batch.checked_at)}.</p>
<p class="evidence-note">Notes in this sample: ${notes.match} match, ${notes.empty} empty on both records, ${notes.different} different, ${notes.unavailable} not compared. Exact text, including whitespace, is compared without copying it here. No note-edit time or propagation lag is known. This sample does not establish the connection's newest-note coverage.</p>
<p class="evidence-note">A bounded check of ${batch.selected} of ${batch.candidates} confirmed-save candidates; ${batch.omitted} not selected. Up to ${batch.limit} per snapshot. Follow-ups get priority, with at least one slot reserved to advance through other candidates. This is not a complete account audit. The newest-item journey above keeps its own receipt.</p>
${batch.progress ? `<p class="evidence-note">This snapshot and retained history include attempts for ${batch.progress.tracked} of ${batch.candidates} candidates; ${batch.progress.without_history} have no record in this snapshot or retained history. ${batch.progress.follow_up} were prioritized for follow-up: ${batch.progress.follow_up_attempted} attempted now, ${batch.progress.follow_up_not_checked} not checked in this snapshot. History describes past attempts; only the rows below have a fresh public-source check.</p>${batch.progress.evicted ? `<p class="evidence-note">Private history retains ${batch.progress.retained} entries, capped at ${batch.progress.history_limit}. ${batch.progress.evicted} history records (${batch.progress.unresolved_evicted} unresolved) have been evicted. The sweep still gives those candidates another turn; no retained history does not mean never checked or resolved.</p>` : ''}` : ''}
${batch.rows.map(item).join('')}${batch.rows.length ? '' : '<p>No item passed a current public-source check in this sample.</p>'}
<p class="evidence-note">${batch.not_public} selected sources were private or no longer present; ${batch.source_unavailable} source checks failed; ${batch.deferred} were deferred by the runtime budget. These sources expose no item identity here. Public-source checks are repeated each snapshot; withdrawn items disappear on the next successful publication, with up to one minute of page caching.</p>
<p class="evidence-note">First observation is not a star time. Article publication dates never start a timer. Capture acknowledgement is not public arrival; record and association checks above are observations, not historical arrival timestamps. <a href="/records/#action-22-star">Import guidance →</a></p></section>`;
}
