import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScenario, renderScenario, scenarioNames } from '../tools/scenarios.mjs';
import { renderNotFound, renderSite } from '../src/page.mjs';

test('every scenario renders four bounded pages with working native cross-page evidence links', async () => {
  for (const name of await scenarioNames()) {
    const { page, pages } = renderScenario(await loadScenario(name));
    assert.deepEqual(Object.keys(pages), ['index.html', 'journeys/index.html', 'history/index.html', 'records/index.html']);
    assert.equal(page, pages['index.html']);
    for (const [key, html] of Object.entries(pages)) {
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, `${name}/${key}: unique IDs`);
      assert.ok(Buffer.byteLength(html) < 2_500_000, `${name}/${key}: page budget`);
      assert.ok(!/<script\b|@import|<(?:link|img|iframe)[^>]+(?:src|href)="https?:/i.test(html), `${name}/${key}: no external assets or scripts`);
      assert.ok(html.includes('font-family:Fraunces') && html.includes("font-family:'Source Sans 3'"));
      assert.equal((html.match(/data:image\/webp;base64,/g) ?? []).length, 2);
      assert.ok(html.includes('<meta name="robots" content="noindex">'));
      for (const [, href] of html.matchAll(/href="(\/(?!\/)[^"]*)"/g)) {
        const [path, fragment] = href.split('#');
        if (path.startsWith('/flows/') || path.endsWith('.json')) continue;
        const target = pages[path.slice(1) + (path.endsWith('/') ? 'index.html' : '')];
        assert.ok(target, `${name}/${key}: missing page ${href}`);
        if (fragment) assert.ok(target.includes(`id="${fragment}"`), `${name}/${key}: missing fragment ${href}`);
      }
    }
    assert.ok(!/<table\b|<pre\b|class="lane lane--/.test(page), `${name}: home does not contain the evidence dump`);
    assert.ok(pages['journeys/index.html'].includes('journal-view--default'));
    assert.ok(pages['records/index.html'].includes('Choose a connection'));
  }
});

test('a current kind with no finished history has its own honest empty view', async () => {
  const { pages, status, journeys, history: index } = renderScenario(await loadScenario('quiet-tuesday'));
  const history = pages['history/index.html'];
  assert.ok(history.includes('id="history-issue"'));
  assert.ok(history.includes('No finished journey for this kind yet.'));
  assert.ok(history.includes('href="/journeys/#journey-issue"'));
  // Saved history survives a missing current receipt. Neither history nor
  // a pocket connection may link to an item view that is no longer rendered.
  status.receipts = status.receipts.filter((r) => r.kind !== 'issue');
  const withoutReceipt = renderSite(status, journeys, index);
  assert.ok(!withoutReceipt['index.html'].includes('href="/journeys/#journey-issue"'));
  assert.ok(!withoutReceipt['history/index.html'].includes('href="/journeys/#journey-issue"'));
  assert.ok(!/<script\b/.test(renderNotFound()));
  assert.ok(renderNotFound().includes('Back to the map'));
});
