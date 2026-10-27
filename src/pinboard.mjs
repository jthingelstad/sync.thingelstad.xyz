// Pinboard's API uses GET even for adds. Never surface its request URL,
// response text or exceptions: the query string contains the API token.
import { setTimeout as sleep } from 'node:timers/promises';

export function pinboardClient({ token, fetch: request = fetch, wait = sleep, clock = Date.now } = {}) {
  let last = clock(); // Also leave room after another invocation's last call.
  let tail = Promise.resolve();
  const call = (method, params = {}) => {
    const result = tail.then(async () => {
      if (!token) throw new Error('Pinboard is not configured.');
      await wait(Math.max(0, 3100 - (clock() - last)));
      last = clock();
      const query = new URLSearchParams({ auth_token: token, format: 'json', ...params });
      let response;
      try {
        response = await request(`https://api.pinboard.in/v1/${method}?${query}`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
      } catch { throw new Error('Pinboard request failed.'); }
      if (!response.ok) {
        const error = new Error(`Pinboard request failed (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }
      try { return JSON.parse(await response.text()); }
      catch { throw new Error('Pinboard returned an invalid response.'); }
    });
    tail = result.catch(() => {});
    return result;
  };
  return {
    update: () => call('posts/update'),
    async get(url) {
      const body = await call('posts/get', { url });
      if (!Array.isArray(body?.posts)) throw new Error('Pinboard returned an invalid bookmark lookup.');
      if (body.posts.length === 0) return null;
      const post = body.posts.find((p) => p.href === url);
      if (!post) throw new Error('Pinboard returned a different bookmark.');
      // Do not retain notes, tags or any other unrelated bookmark content.
      return { url: post.href, saved_at: post.time ?? null, shared: post.shared ?? null };
    },
    async add(item, { shared, tags }) {
      const result = await call('posts/add', {
        url: item.url, description: item.title, replace: 'no',
        shared: shared ? 'yes' : 'no', tags: tags.join(' '),
        // The article's publication date is not the date Jamie saved it.
        dt: item.first_seen_at, toread: 'no',
      });
      // An application error may be a concurrent save. Only the independent
      // exact lookup that follows decides whether this item has arrived.
      if (typeof result?.result_code !== 'string') throw new Error('Pinboard returned an invalid add response.');
      return result.result_code === 'done';
    },
  };
}
