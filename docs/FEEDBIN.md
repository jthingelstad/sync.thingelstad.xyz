# Feedbin stars to Pinboard

Jamie requested this connection on 2026-10-27: Feedbin is where he reads and
discovers articles, before saving them to Pinboard. He selected **public
bookmarks, no added tags, and import missing links from the current feed**.
Hop 22 in `../shared/flows.json` is the contract. This additive writer is an
explicit exception to sync's observation-only role; it changes no other hop.

The existing probe imports on its half-hour clock. It reads the starred RSS
feed, durably journals discovered article URLs, checks each exact URL with
Pinboard `posts/get`, and creates missing bookmarks with `replace=no`.
Every creation needs an independent `posts/get` confirmation. Existing
bookmarks retain their title, note, tags, privacy, unread status and save
date. New bookmarks use the article title (the URL when untitled), no note,
no tags, and the time sync first discovered them. Feed article bodies and
publication dates are never copied into a Pinboard note or save time.

An unstar never deletes a bookmark. A confirmed save is not re-created if
Jamie later deletes it deliberately. Article URLs are used as supplied,
with standard URL parsing; sync does not guess about tracking parameters,
HTTP versus HTTPS, redirects or different URLs for the same article.

## Reliability and evidence

`facts/feedbin.json` is the private runtime journal. CloudFront is explicitly
denied this object at the bucket policy, independently of request-path
encoding. The Lambda's existing access is unchanged. It stores article identities, titles,
URLs, first-observation times, pending state and confirmed save receipts.
The queue lands before any external request, then each confirmation lands
before the next item. A crash after a save retries the exact lookup;
`replace=no` protects against another client saving between lookup and add.
An acknowledged add without readback remains pending. Pending items survive
leaving the feed. Storage failures stop further saves. Rate limits halt the
batch and retain a retry time with exponential backoff.

Pinboard requests are sequential, at least 3.1 seconds apart. A run handles
at most twenty queued URLs and leaves two minutes of the Lambda's five-minute
timeout for observation and publishing. Initial catch-up may take several
half-hour rounds. Normal publishing events, deploy invocations, rehearsals
and journey follow-ups never import.

The map distinguishes a `star` (one exact article, Feedbin to Pinboard) from
a `link` (Pinboard's change stamp, watched downstream as before). A newer
unrelated bookmark cannot prove a star arrived. The feed gives article
publication dates, **no star timestamps**; star journeys quote no
starring-to-save lag. Pending age on this hop is since first observation.

Feedbin's feed is the fifty most recently starred articles, ordered by the
star record's creation time ([Feedbin's controller](https://github.com/feedbin/feedbin/blob/master/app/controllers/starred_entries_controller.rb)).
An article starred and unstarred between polls, or displaced by fifty newer
stars before a successful poll, cannot be recovered through this RSS feed.
Use Feedbin's authenticated API if that becomes an observed problem.

## Configuration and deployment

The existing `pinboard_token` key in `sync-runtime` continues to resolve
through CloudFormation's Secrets Manager dynamic reference. Nobody retrieves
the token into a session. No new role, permission, queue, schedule or secret
is needed.

One `FeedbinConfig` NoEcho CloudFormation parameter supplies private JSON
connection configuration to `FEEDBIN_CONFIG`. Its `url` is the starred-feed
address Jamie supplied; never commit it or publish it into facts, HTML or
logs. The other fields are:

```json
{"url":"<starred-feed address>","mode":"preview","initial":"import","shared":true,"tags":[]}
```

Put that configuration in a mode-0600 gitignored file and supply its path:

```
npm test
SYNC_FEEDBIN_CONFIG_FILE=.build/feedbin-config.json npm run plan
SYNC_FEEDBIN_CONFIG_FILE=.build/feedbin-config.json npm run deploy
```

`preview` permits observation only. Invoke the deployed function with
`{"feedbin_preview":true}` to check up to fifty exact URLs. It returns counts
only, writes no Pinboard or S3 data, and respects the remaining runtime.
Change `mode` to `active` and deploy to enable the real half-hour importer.
`initial: "future"` instead records the first successful feed as an ignored
baseline; changing the setting later does not undo that baseline.

Routine deploys use `UsePreviousValue` to preserve this NoEcho parameter,
never its masked `DescribeStacks` result. Deploy with a file containing an
empty string to remove the configuration. Setting `mode` back to `preview`
pauses saves while retaining the journal. A rehearsal returns before even
reading the configuration. The feed URL and API errors never enter public
output; logs and failures use generic messages or HTTP status codes.

## Continuing to Linking Things

Jamie requested the next leg on 2026-10-27. Hop 23 captures only confirmed
explicitly public Pinboard records into Links' private S3 inbox. The private
journal stores only a digest pointer, link id and capture time. A metadata-only
`pinboard/bookmarks-ready` event wakes Linking Things' AWS publisher. The
Pinboard credential and private raw account export stay in their existing
source runtimes. `docs/SUBSCRIBERS.md` describes the off/active capture switch;
the destination owns its IAM event rule and needs no GitHub key.
Invoke `{"bookmarks_preview":true}` for a read-only five-record API contract
check in the deployed runtime; it returns counts only.

The Links build combines its additive ledger with the nightly full snapshot,
with canonical fields and newer snapshots taking precedence. Sync verifies
the current star through the exact public JSON twin, independently of the
account-wide change stamp. A star remains untimed, even when all three
systems hold it. Pending wake-ups retry each half-hour until the deployed
Links fact acknowledges the captures. This exception changes no other hop.
