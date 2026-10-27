import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('sync captures only in active mode and leaves the subscriber to Linking Things', async () => {
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url)));
  assert.equal(template.Parameters.LinksBookmarkMode.Default, 'off');
  const r = template.Resources;
  assert.deepEqual(template.Parameters.LinksBookmarkMode.AllowedValues, ['off', 'active']);
  for (const resource of Object.values(r)) assert.ok(!['AWS::Events::Connection', 'AWS::Events::ApiDestination'].includes(resource.Type));
  assert.ok(!JSON.stringify(template).includes('github_links_actions_token'));
  const role = Object.values(r).find((resource) => resource.Type === 'AWS::IAM::Role' && JSON.stringify(resource).includes('CapturePublicBookmarks'));
  const permission = role.Properties.Policies.flatMap((policy) => policy.PolicyDocument.Statement).find((s) => s['Fn::If']?.[1]?.Sid === 'CapturePublicBookmarks')['Fn::If'];
  assert.equal(permission[0], 'ActiveLinksBookmarks');
  assert.equal(permission[1].Action, 's3:PutObject');
  assert.equal(permission[1].Resource['Fn::Sub'], 'arn:${AWS::Partition}:s3:::links-storage-inbox-${AWS::AccountId}/bookmarks/*');
  assert.equal(r.Function.Properties.Environment.Variables.LINKS_BOOKMARK_INBOX['Fn::If'][0], 'ActiveLinksBookmarks');
});
