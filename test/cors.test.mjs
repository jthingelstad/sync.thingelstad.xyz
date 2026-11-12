import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// status.json is the one path other sites read from a browser (thingelstad.xyz's Sync gadget), so it alone is served
// with CORS (any origin, GET and HEAD, no credentials) beside the same security headers; every other path keeps the
// security headers only.
const CORS_AND_SECURITY = 'e61eb60c-9c35-4d20-a928-2b84e02af89c'; // Managed-CORS-and-SecurityHeadersPolicy
const SECURITY = '67f7725c-6f97-4210-82d7-5512b31e9d03'; // Managed-SecurityHeadersPolicy

test('only status.json is readable cross-origin', async () => {
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url), 'utf8'));
  const config = template.Resources.Distribution.Properties.DistributionConfig;
  assert.equal(config.DefaultCacheBehavior.ResponseHeadersPolicyId, SECURITY);
  assert.deepEqual(
    config.CacheBehaviors.map((b) => [b.PathPattern, b.ResponseHeadersPolicyId]),
    [['status.json', CORS_AND_SECURITY]]
  );
  const [status] = config.CacheBehaviors;
  assert.deepEqual(status.AllowedMethods, ['GET', 'HEAD']);
  assert.deepEqual(status.CachePolicyId, config.DefaultCacheBehavior.CachePolicyId);
  assert.equal(status.TargetOriginId, config.DefaultCacheBehavior.TargetOriginId);
});
