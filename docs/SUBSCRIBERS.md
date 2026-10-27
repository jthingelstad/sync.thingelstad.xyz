# Subscribers, prepared off

`src/subscribers.mjs` is the pure build-time definition. Run
`node tools/build-subscribers.mjs` after changing it; tests compare its
generated resources with infra/sync.json and rehearse bodies on fixtures.
The deploy compacts JSON to fit CloudFormation's TemplateBody wire limit.
No application dependency is added.

| Hop | Event | Pinned workflow | sync-runtime key |
| --- | --- | --- | --- |
| 10 | wt-builder published, issue, archive leg | librarian-thing/library-round.yml | github_librarian_actions_token |
| 6 | wt-builder published, issue, website leg | links.thingelstad.xyz/sync-join.yml | github_links_actions_token |
| 13 | github pushed, registered public repository | thingelstad.xyz/sync-rebuild.yml | github_registry_actions_token |
| 13 | xyz refreshed, verified public registry revision | librarian-thing/library-round.yml, only=things | github_librarian_actions_token |

All parameters default false. ConfigureLibrarianSubscriber (or Links,
Registry) creates that connection, scoped invocation role, ping rule and
disabled work rule. It requires RuntimeSecret. EnableLibrarianSubscriber
(or Links, Registry) separately opens real work after rehearsal. Hop 6 also
requires ApproveLinksJoinRepair=true here and SYNC_JOIN_APPROVED=true in
Links. Never open either without Jamie's explicit permission to repair
WT354. Existing clocks/nudges and their flows labels stay until activation.

Each role invokes only its API destination, with rule/account-scoped trust.
The endpoint pins the repository, workflow and main branch. Targets retry
at most ten times in one hour; exhausted requests go to a retained,
encrypted private queue for fourteen days. No alarm is added (step 9 is
held). Delivery is at least once; conditional archive uploads, workflow
concurrency and unchanged-output checks absorb duplicates. An accepted HTTP
request is not proof that a workflow completed.
The registry excludes its own repository's pushes: publishing already
deploys that site, and collecting a collector commit again would loop.
Each accepted push refreshes only that registered repository and its commit
evidence; it does not repeat Wayback, screenshots, website or Tinylytics reads.
Its downstream RegistryLibrary route is separate: only a verified changed
public document wakes the library. It reuses the Librarian repository token
key through its own independently gated connection and role. A document
revision does not invent individual thing publication dates or journeys.
ConfigureRegistryLibrarySubscriber and EnableRegistryLibrarySubscriber
default false; environment overrides are
SYNC_CONFIGURE_REGISTRY_LIBRARY_SUBSCRIBER and
SYNC_ENABLE_REGISTRY_LIBRARY_SUBSCRIBER. The existing registry deployer
gets no permission unless RegistryPublisherRole is explicitly supplied
(SYNC_REGISTRY_PUBLISHER_ROLE); the grant is xyz refreshed/ping only.
The destination's SYNC_PUBLISHING_BUS is also empty by default.

## Jamie's activation order

1. Review and merge the destination workflow and receipt PRs under their
   own rules. This night leaves them unmerged and undeployed.
2. In GitHub > Settings > Developer settings > Personal access tokens >
   Fine-grained tokens, make one expiring token per destination repository,
   selecting only that repository and Actions read/write. GitHub cannot
   scope a PAT to one workflow; the endpoint and IAM role do.
3. In AWS Secrets Manager, us-east-1 > sync-runtime > Retrieve secret value
   > Edit, Jamie adds the matching key above and saves. A session never
   reads or prints a value. Connections use dynamic references; no Lambda
   receives these tokens or secret-read grants. EventBridge keeps its own
   service-linked copy; token rotation needs a connection update/recreation.
4. Plan as cloud-engineer with SYNC_CONFIGURE_<NAME>_SUBSCRIBER=true, read
   the change set, then deploy with the same setting. Real-work flags stay
   false. Names are LIBRARIAN, LINKS and REGISTRY.
5. A ping uses source wt-builder for Librarian/Links or github for Registry,
   detail-type ping and detail { subscriber: "librarian|links|registry" }.
   It requests dry_run true; the destination rehearsal has no checkout,
   credentials, pulls, commits, upload, collection or deployment. No bus
   event or workflow dispatch was sent to rehearse this night.
6. Enable one work rule only after its dry run succeeds and permissions and
   receipts are ready. Registry additionally needs SYNC_REBUILD_ENABLED=true
   in its repo. Keep WT Builder's nudge and clocks until a natural real send
   links bus delivery, workflow success and received arrival. Then review
   the old trigger's cutover and update shared flows. No synthetic published
   test. Hop 6 stays disabled until Jamie's separate repair decision.

The deploy preserves previous switches. Overrides are
SYNC_CONFIGURE_LIBRARIAN_SUBSCRIBER, SYNC_ENABLE_LIBRARIAN_SUBSCRIBER (and
LINKS/REGISTRY), and SYNC_APPROVE_LINKS_JOIN_REPAIR. Default deploys create
no connection, API destination, role, rule or failure queue.

Primary references: [GitHub dispatch and PAT permissions](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event),
[connection dynamic references](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-events-connection.html),
[API destinations and retries](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destinations.html).
