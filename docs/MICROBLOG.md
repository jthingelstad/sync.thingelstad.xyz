# The blog's publication receipt

The probe reads `https://www.thingelstad.com/feed.json` without authentication.
It keeps public permalinks, publication times, titles and category titles;
category ids are hashes of their titles. It never copies post bodies, alt
text, authors or source HTML into a public fact or event.

`test/fixtures/blog-public-feed-2026-10-27.json` is an unmodified public
response, with its URL, capture time and checksum beside it. Its 25 entries
carry `tags`, but no independent Micropub uid or modification time. The
[feed documentation](https://help.micro.blog/t/feeds/94) describes the public
JSON feed; [categories](https://help.micro.blog/t/using-categories/68) appear
as tags there.

## From a poll to an event

`src/blog.mjs` is pure. The first successful observation establishes a
silent baseline; an existing post journey is its baseline if available.
Nothing announces the feed's back catalogue as new sends. Later polls
queue unseen posts at or after that watermark, in publication order. The
feed is a recent window, not a complete catalogue: a gap spanning more
than its 25 entries cannot be reconstructed from this response.

The handler puts each new post on `thingelstad-publishing` as source
`microblog`, detail type `published`, kind `post`, with its permalink as id
and its `website` leg. Its role may put only that source and type on this
bus. It checks the per-entry acknowledgement, not just HTTP success.

`facts/microblog-producer.json` keeps the baseline, last acknowledged post
and up to 100 seen ids. It is saved before sending and after each successful
entry. A failure retries the remaining entries; a send followed by a failed
cursor write may be delivered again. Folding a retry is idempotent.

`facts/microblog.json` is separate: only consuming a bus event writes that
publication receipt. A queued event cannot advance a post journey. The
feed's actual newest post stays visible on the node while the journey waits
for its consumed event. Equal-second events can arrive out of order without
changing the feed's chosen identity. URL ids use a stable hash in Scheduler
names; the seven follow-up times remain unchanged.

Both paths are rehearsed in `blog-awaiting-event` and `blog-event-arrived`.
The previews and SDK transport tests use fixtures and mocks, never bus
traffic. No publication test is sent to production.

## The stored-source receipt waits for evidence

Jamie explicitly allowed a public-response fixture when the authenticated
response shape is uncertain. This step takes that fallback. Hop 19 stays
**no fact**, with a reason, rather than calling an old publication date a
late metadata write. The rendered feed is the only witness available here;
it cannot prove that the Library Agent's latest write landed.

TODO before enabling a read-only `GET /micropub?q=source`:

- Obtain an independent expected `properties.uid[0]` for the requested
  permalink and verify the returned identity against it.
- Verify a modification-time field, and obtain the Library Agent's write
  time and expected category/alt/Featured ids. A publication time is not a
  modification receipt.

The [Micropub source documentation](https://book.micro.blog/micropub/)
describes property arrays, but this captured response supplies neither
missing field. The authenticated call is unbuilt behind that TODO. When it
is enabled, it may read `MICROBLOG_API_KEY` only from the environment and
perform only `q=source`; no post or update is allowed. The stack resolves
the existing `microblog_api_key` key of `sync-runtime` into that variable.
No session reads the key's value.

Another Thing's feed remains its manual producer. Hop 21 stays unverified
until WT Builder's first real Another Thing send announces itself.
