# Kickoff prompt for Codex

Paste the block below into Codex on the Mac (best model, long run), started
in `~/Projects/thingelstad.com/sync.thingelstad.xyz`, so the sibling
checkouts and the cloud-engineer identity are there. It is written so Codex
can work the night without a reply; where it needs Jamie it stops and says so
in the PR.

---

You are building the sync system for Jamie Thingelstad's sites. Read, in
order: `AGENTS.md`, `docs/PLAN.md`, `data/flows.json`, then `src/*.mjs` and
`test/*.test.mjs`. The plan is the brief; this message only tells you how to
work it.

Work the plan's steps 1, 2, 3, 4, 6 and 7, in that order, each as its own
pull request from a branch named `plan/<step>-<slug>`. For each: build, test,
open the PR, ask for a review with `@codex review`, answer every finding,
merge with a merge commit, pull `main`, then deploy with `npm run plan` and
`npm run deploy` as the cloud-engineer identity (check it first:
`aws sts get-caller-identity --profile cloud-engineer` must show account
999153317627 and `assumed-role/ProjectsCloudEngineer/projects-cloud-engineer`).
Read the change set before applying it. If a deploy rolls back or
`health.json` fails afterwards, stop the night there and write what happened
in the PR. Then do steps 5 and 8: open their PRs in the destination repos
(librarian-thing, thingy.thingelstad.com, weekly.thingelstad.com,
another.thingelstad.com, links.thingelstad.xyz, wt-builder) and the flows
rows, but do not merge or deploy in those repos; each has its own rules in
its `AGENTS.md`. Do not start step 0, 9 or 10.

For each PR:

1. Keep every rule in "Rules every step keeps". In particular: pure modules
   with tests on fixtures; no runtime dependency beyond Node 24, the AWS SDK
   and Pele; nothing in the public files but ids, times and titles; no script
   in the browser; no secret value anywhere.
2. A hop change is a flows row first. The contract is `../shared/flows.json`
   in the thingelstad.com checkout one level up; change it there, run
   `node shared/build-flows.mjs`, commit directly to its `main` (that repo's
   rule for small changes), then `npm run flows:sync` here. Step 4's
   `received` event, step 6's micro.blog producer and step 7's three webhook
   senders each need rows or row notes.
3. `npm test` passes. Add `npm run preview` in step 1 and keep it rendering
   every scenario through every later step; include the rendered page's
   text for the "send in progress" scenario in the PR description so the
   result can be read without running anything.
4. Update `AGENTS.md` where the layout or a convention changes, in the
   same voice it already has (short, says why, quotes Jamie where a rule
   came from him). Do not add a section about yourself.
5. Tick a step in `docs/PLAN.md` in its own commit once it is deployed and
   `health.json` is good, with the date and the PR number.
6. Write the PR description for a reader who was asleep: what changed, how
   it was tested, what the deploy changed, the live URL to look at, and
   anything that is Jamie's decision (the plan names two in step 3: leave
   both unbuilt and ask in the PR). Step 7's intake deploys with its three
   senders off until Jamie adds each signing secret as a key in
   `sync-runtime`; name the keys and the console steps in that PR.
7. Commit messages are one line in the repo's existing style (a sentence
   about what the system now does, not what you did), no model names, no
   co-author trailers.

Design calls in step 3 that the brief leaves open are yours, within the
shared type and the no-italics rule; choose the plainer option and say in
the PR what you chose and why. The story paragraph must be generated from
the journey data only, never from a template that could state something the
facts do not support: if a lag is not observed, the sentence does not quote
one.

When step 6 touches `MICROBLOG_API_KEY`, the reader is read-only (Micropub
`q=source`); never a write, and the key is only ever read from the
environment. If the micro.blog response shape is uncertain, record a real
response as a fixture from the public JSON feed instead and leave the
authenticated call behind a clear TODO naming the field you need.

Never put a `published` event on the bus as a test (the probe records it as
a real send); rehearse with `"rehearsal": true` on a direct invoke, a `ping`
detail-type, or fixtures. Never read a secret's value, from Secrets Manager
or from any `.env`. Never write to micro.blog, Buttondown, Pinboard or any
live system; reads only.

Stop when the steps are done or one is blocked. Leave a note at
`docs/NIGHT-2026-10-26.md`: each step with its PR, its deploy, what is live,
and what waits for Jamie, in order, one or two lines each.
