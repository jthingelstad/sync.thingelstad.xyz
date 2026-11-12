import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const SECURITY = '67f7725c-6f97-4210-82d7-5512b31e9d03'; // Managed-SecurityHeadersPolicy

test('only status.json is readable cross-origin', async () => {
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url), 'utf8'));
  const config = template.Resources.Distribution.Properties.DistributionConfig;
  assert.equal(config.DefaultCacheBehavior.ResponseHeadersPolicyId, SECURITY);
  assert.deepEqual(
    config.CacheBehaviors.map((b) => [b.PathPattern, b.ResponseHeadersPolicyId]),
    [['status.json', { Ref: 'StatusHeaders' }]],
  );
  const [status] = config.CacheBehaviors;
  assert.deepEqual(status.AllowedMethods, ['GET', 'HEAD']);
  assert.deepEqual(status.CachePolicyId, config.DefaultCacheBehavior.CachePolicyId);
  assert.equal(status.TargetOriginId, config.DefaultCacheBehavior.TargetOriginId);
});

// The managed CORS policies leave Allow-Headers empty, and CloudFront then adds no Allow-Origin to a request with
// any header outside the CORS safelist, which every Chrome fetch has (priority). Allow-Headers * is what browsers need.
test('status.json answers browsers: any origin, any request header, GET and HEAD, no credentials', async () => {
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url), 'utf8'));
  const policy = template.Resources.StatusHeaders;
  assert.equal(policy.Type, 'AWS::CloudFront::ResponseHeadersPolicy');
  const { CorsConfig: cors, SecurityHeadersConfig: security } = policy.Properties.ResponseHeadersPolicyConfig;
  assert.deepEqual(cors.AccessControlAllowOrigins.Items, ['*']);
  assert.deepEqual(cors.AccessControlAllowHeaders.Items, ['*']);
  assert.deepEqual(cors.AccessControlAllowMethods.Items, ['GET', 'HEAD']);
  assert.equal(cors.AccessControlAllowCredentials, false);
  assert.ok(security.ContentTypeOptions && security.FrameOptions && security.StrictTransportSecurity);
});
