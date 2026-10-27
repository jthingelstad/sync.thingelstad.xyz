# Subscribers: none yet

A subscriber is a rule on the bus that starts a destination's workflow
(EventBridge API destination → GitHub `workflow_dispatch`). The night of
2026-10-26 prepared four, all off, as twenty dormant resources and ten
parameters; they were removed on 2026-10-27 to keep the stack hobby-sized
(the code is in git history at 987138f, sync PRs #10 and #11). The
destination workflows they would call stay merged and inert in their repos.

When the first one is wanted, add it as its own PR with its flows row, in
this shape and nothing more: a Connection whose token is a dynamic
reference to a key in `sync-runtime` (one fine-grained PAT per repository,
Actions read/write), an ApiDestination pinned to the repository, workflow
and `main`, a role that may only invoke that destination, and one rule.
Rehearse with a `ping` that requests a dry run; enable real work only after
the dry run succeeds; keep the old nudge or clock until one natural send
has gone bus → workflow → `received`, then retire it and update the flows
row.

| Hop | Event | Workflow | sync-runtime key |
| --- | --- | --- | --- |
| 10 | wt-builder published, issue, archive leg | librarian-thing/library-round.yml | github_librarian_actions_token |
| 6 | wt-builder published, issue, website leg | links.thingelstad.xyz/sync-join.yml | github_links_actions_token |
| 13 | github pushed, registered public repository | thingelstad.xyz/sync-rebuild.yml | github_registry_actions_token |
| 13 | xyz refreshed, verified registry revision | librarian-thing/library-round.yml, only=things | github_librarian_actions_token |

Hop 6 stays the WT354 worked example until Jamie decides otherwise.
