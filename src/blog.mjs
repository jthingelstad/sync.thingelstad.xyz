// The public feed supplies observations; only a consumed publishing event
// starts a new post journey. First observation establishes a silent baseline.
export const BLOG_PUBLISHER_KEY = 'facts/microblog.json';
export const BLOG_PRODUCER_KEY = 'facts/microblog-producer.json';

const pick = (p) => p ? { id: p.id, at: p.at, url: p.url ?? null, title: p.title ?? null } : null;
const latest = (items) => items.filter((p) => p?.at).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0] ?? null;

export function sourceReceiptTodo() {
  // TODO: before enabling GET /micropub?q=source, obtain an independent
  // expected properties.uid[0] and the Library Agent's write at/expected
  // field ids. The captured public feed supplies neither uid nor modified
  // time. Read MICROBLOG_API_KEY only from the environment when that GET
  // is enabled; never fetch a secret or copy source content into a fact.
  return { state: 'no-fact', why: 'Stored-source receipt deferred: this reader has no verified independent Micropub uid or modification-time contract, and the Library Agent publishes no write receipt. No stored/rendered arrival or lag is claimed.' };
}

export function blogPlan({ state = null, publisher = null, fact = {}, current = null, now }) {
  if (state && (state.version !== 1 || !Array.isArray(state.seen))) throw new Error('Unsupported micro.blog producer state');
  const post = fact.newest?.post;
  const posts = fact.observed_posts ?? (post ? [post] : []);
  const announced = publisher?.newest?.post;
  const next = state ? structuredClone(state) : { version: 1, baseline: null, queued: null, seen: [], updated_at: now };
  if (!next.baseline) {
    next.baseline = pick(current ?? announced ?? post);
    next.seen = posts.filter((p)=>Date.parse(p.at)<=Date.parse(next.baseline?.at)).map((p)=>p.id);
  }
  if (next.baseline && !next.seen.includes(next.baseline.id)) next.seen.push(next.baseline.id);
  if (announced && !next.seen.includes(announced.id)) next.seen.push(announced.id);
  const watermark = latest([next.baseline,next.queued,announced]);
  const events = fact.error || !watermark ? [] : posts
    .filter((p)=>!next.seen.includes(p.id) && Date.parse(p.at)>=Date.parse(watermark.at) && Date.parse(p.at)<=Date.parse(now))
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||(String(a.id)<String(b.id)?-1:1))
    .map((p)=>({source:'microblog','detail-type':'published',detail:{product:'blog',kind:'post',id:p.id,title:p.title??null,url:p.url,leg:'website',leg_url:p.url,at:p.at,legs:{website:{at:p.at,url:p.url}}}}));
  next.seen = next.seen.slice(-100);
  next.updated_at = now;
  // Equal-second posts may be delivered out of order. The feed chooses the
  // newest identity, but only a matching consumed event can start its journey.
  const consumed = (item) => item && ((publisher?.events ?? []).find((e)=>e.kind==='post' && e.id===item.id) ?? (announced?.id===item.id ? announced : null));
  const proof = consumed(post);
  // Keep the selected identity across failed or stale feed reads. A newer
  // consumed event can advance it; an equal-second delivery cannot undo it.
  const publication = latest([proof ? { ...pick(post), at: proof.at } : null,current,announced,next.baseline]);
  const via = consumed(publication) ? 'bus' : 'baseline';
  const visible = { ...fact, publication: { item: pick(publication), via }, source_receipt: sourceReceiptTodo(), extra: { ...fact.extra, publication_state: post && post.id!==publication?.id ? 'feed and consumed publishing receipt name different posts; the journey waits for the bus' : via==='bus' ? 'publication witnessed on the bus' : 'initial observation; no historical send announced' } };
  delete visible.observed_posts;
  return { state: next, events, fact: visible };
}

export function acknowledgeBlog(state, event, now) {
  const next=structuredClone(state);
  next.queued=pick(event.detail);
  if(!next.seen.includes(event.detail.id)) next.seen.push(event.detail.id);
  next.seen=next.seen.slice(-100);
  next.updated_at=now;
  return next;
}
