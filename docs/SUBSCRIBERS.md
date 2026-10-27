# Publishing subscribers

The first active destination is the public bookmark path (hop 23), approved
2026-10-27. The destination owns its subscriber: one EventBridge rule in the
Linking Things `links-publisher` stack matches `pinboard/bookmarks-ready` and
starts its serialized CodeBuild publisher through IAM. It drains the durable
private inbox, builds the approved static site, and reports exact public
arrivals. It requires no GitHub dispatch token or source connection.

Sync's `LinksBookmarkMode=active` enables the capture producer; `off` stops
future captures and wake-ups. `../links.thingelstad.xyz/docs/BOOKMARKS.md`
describes the approved source package, activation, receipts and retries.
The nightly mirror and WT354 join remain in place.

A subscriber starts work in a destination. It belongs in that destination's
stack, with permission to start only its actual worker. The publishing bus
remains in Sync. A new subscriber needs its own flows row and implementation;
no switches or resources are reserved for future destinations.

The night of 2026-10-26 prepared four dormant GitHub dispatch subscribers as
twenty resources and ten parameters. They were removed the following morning
to keep this hobby-sized (git history 987138f). The later token-dependent
bookmark bridge was replaced by this AWS publisher before activation.
Hop 6 remains the WT354 worked example until Jamie decides otherwise.
