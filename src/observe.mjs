// One pure observation round, shared by Lambda and every page scenario.
// Readers and storage are outside this module.
import { advanceAll, copyHistory, historyFor } from './journey.mjs';
import { probe } from './probe.mjs';
import { copyReceived, foldReceived, reportedFacts } from './received.mjs';

export function observe({ flows, facts, journeys = null, history = null, received = null, now, code = null, trigger = { type: 'clock' } }) {
  const recorded = copyHistory(history, journeys);
  const initial = probe({ flows, facts: reportedFacts(facts, journeys), now, code, trigger });
  const seeded = advanceAll(journeys, initial, recorded);
  const folded = foldReceived(seeded, recorded, copyReceived(received), now);
  const status = probe({ flows, facts: reportedFacts(facts, folded.journeys), now, code, trigger });
  const next = advanceAll(folded.journeys, status, folded.history);
  const kept = historyFor(folded.history, journeys, next, now);
  const retired = [...new Map([...folded.retired, ...kept.retired].map((r) => [r.key, r])).values()];
  return { status, journeys: kept.journeys, history: kept.index, retired, received: folded.queue, rejected_received: folded.rejected };
}
