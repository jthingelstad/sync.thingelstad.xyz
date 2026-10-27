# Kickoff prompt for Codex

Paste the block below into a Codex cloud task on `jthingelstad/sync.thingelstad.xyz`
(best model, long run). It is written so Codex can work the night without a
reply; where it needs Jamie it stops and says so in the PR.

---

You are building the sync system for Jamie Thingelstad's sites. Read, in
order: `AGENTS.md`, `docs/PLAN.md`, `data/flows.json`, then `src/*.mjs` and
`test/*.test.mjs`. The plan is the brief; this message only tells you how to
work it.

Work the plan's steps 1, 2, 3, 4 and 6, in that order, each as its own pull
request from a branch named `plan/<step>-<slug>`. Do not merge. Do not start
step 0, 5, 7, 8, 9 or 10 (they need deploys, IAM or Jamie). If a step's
acceptance cannot be met without AWS access, build and test everything that
can be, and say precisely in the PR what remains and the command that runs it.

For each PR:

1. Keep every rule in "Rules every step keeps". In particular: pure modules
   with tests on fixtures; no runtime dependency beyond Node 24, the AWS SDK
   and Pele; nothing in the public files but ids, times and titles; no script
   in the browser; no secret value anywhere.
2. A hop change is a flows row first. The contract lives in
   `jthingelstad/thingelstad.com` at `shared/flows.json`; change it there in
   a PR (run `node shared/build-flows.mjs` to re-render `shared/flows.html`),
   then copy both files byte for byte into `data/` here. Step 4's `received`
   event and step 6's micro.blog producer each need rows or row notes.
3. `npm test` passes. Add `npm run preview` in step 1 and keep it rendering
   every scenario through every later step; include the rendered page's
   text for the "send in progress" scenario in the PR description so the
   result can be read without running anything.
4. Update `AGENTS.md` where the layout or a convention changes, in the
   same voice it already has (short, says why, quotes Jamie where a rule
   came from him). Do not add a section about yourself.
5. Tick nothing in `docs/PLAN.md`; a step is ticked when it is live. Add a
   line under its heading, "Built in PR #n, not yet deployed", with the
   date.
6. Write the PR description for a reader who will deploy it from a Mac in
   the morning: what changed, how it was tested, the exact deploy command,
   and anything that is Jamie's decision (the plan names two in step 3:
   leave both unbuilt and ask in the PR).
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

Stop when the five PRs are open or when a step is blocked; in the last PR's
description, list the five PRs in order with one line each.
