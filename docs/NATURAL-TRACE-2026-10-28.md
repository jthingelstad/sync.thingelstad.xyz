# Natural post and Feedbin trace, October 28

Jamie published a post and starred two feed items while the field-guide
redesign was in progress, then invited a trace and debugging pass. This uses
their natural publication/import events, exact public records and existing
CloudWatch reports. No post, star, bookmark, arrival, bus event or worker run
was created for verification.

## Evidence

Times below are October 28, US Central (CDT, UTC−05:00).

| Item | Observation and destination evidence |
| --- | --- |
| [DNS post](https://www.thingelstad.com/2026/10/28/ive-moved-all-my-dns.html) | Published 12:14:09 a.m. in the public feed. The 12:34:50 clock announced it; the bus event was consumed at 12:34:58. Its social card answered 200 at first observation, so its arrival lag is unmeasured. |
| [ENSv2 Is Live on Mainnet](https://links.thingelstad.xyz/links/7fd48bffa596/) | Feedbin id 5428695137, first seen 12:34:25. Pinboard's exact readback confirmed it at 12:34:34. Links reported arrival at 12:39:02; its public page, exact JSON twin and capture acknowledgement match. |
| [An ENSv2 Collectible With Your Name on It](https://links.thingelstad.xyz/links/38199c9b333a/) | Feedbin id 5428624232, first seen 12:34:25. Pinboard's exact readback confirmed it at 12:34:43. Links reported arrival at 12:39:02; its public page, exact JSON twin and capture acknowledgement match. |

The importer report says two added, zero pending and no error. Both public
captures are acknowledged by Links' deployed `sync-fact.json`. Feedbin supplies
no star times, so none of the observation/import times is represented as when
Jamie starred an item, or as a publication-to-arrival lag.

The post is still waiting at the Librarian and Thingy. Their current blog
fact is the October 25 post, id 6055122. Hop 11's existing clock is 5:00 a.m.
Central with a 7:17 a.m. backstop; no blog-published subscriber starts that
round today. This matches the flows contract and is not yet late. WT Builder
has no post fact. Its missing observation and the WT354 join were not repaired.

CloudWatch `/aws/lambda/sync` confirms the natural clock, publication event,
both Links receipts and the 2, 5, 10 and 15 minute follow-up runs. An error
query over the preceding two hours matched only clock reports containing
`error: null`; it found no import failure or execution exception.

## Factual correction

The first follow-up ran at 12:36:58, 22 minutes 49 seconds after publication.
The old checked line called it “2 min after the website leg of post went out.”
`followUps` deliberately starts its timer at event consumption, so that label
was false when publication discovery or delivery was delayed.

The checked line now names the nominal follow-up, and Snapshot & data states
that its timer starts when the event is received. Scheduling, publication
times and journey measurements are unchanged. A regression reproduces the
natural 20-minute discovery delay and checks all four HTML pages.
All 110 tests and ten offline scenarios pass on Node 24. A JavaScript-disabled
browser check at 1440×1000 and 390×844 verifies the checked line and colophon on
all four pages, with no page overflow; the phone screenshot was inspected.

## Batch visibility limit

The current contract follows the newest item of each kind. Both stars were
discovered in the same poll, so only 5428695137 became the current star journey.
The other star's real Links report remains in the one-hour unmatched-receipt
queue because it has no current or archived journey. Its public destination
record still proves delivery. Individual journey history for every star in a
batch would require extending that contract; this trace leaves it unchanged.
