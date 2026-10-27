import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('the one subscriber pins its workflow, main, secret boundary and invoke scope', async () => {
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url)));
  assert.equal(template.Parameters.LinksBookmarkMode.Default, 'off');
  const r = template.Resources;
  for (const name of ['Connection', 'Destination', 'InvokeRole', 'Rule']) assert.equal(r[`LinksBookmark${name}`].Condition, 'HasLinksBookmarks');
  const connection = r.LinksBookmarkConnection.Properties;
  assert.equal(connection.AuthParameters.ApiKeyAuthParameters.ApiKeyValue['Fn::Sub'], 'Bearer {{resolve:secretsmanager:${RuntimeSecret}:SecretString:github_links_actions_token}}');
  assert.match(r.LinksBookmarkDestination.Properties.InvocationEndpoint, /\/jthingelstad\/links\.thingelstad\.xyz\/actions\/workflows\/sync-bookmarks\.yml\/dispatches$/);
  const permission = r.LinksBookmarkInvokeRole.Properties.Policies[0].PolicyDocument.Statement[0];
  assert.equal(permission.Action, 'events:InvokeApiDestination');
  assert.deepEqual(permission.Resource, { 'Fn::GetAtt': ['LinksBookmarkDestination', 'Arn'] });
  const rule = r.LinksBookmarkRule.Properties;
  assert.deepEqual(rule.EventPattern.source, ['pinboard']);
  const [, active, rehearsal] = rule.Targets[0].Input['Fn::If'];
  assert.deepEqual(JSON.parse(active), { ref: 'main', inputs: { dry_run: 'false' } });
  assert.deepEqual(JSON.parse(rehearsal), { ref: 'main', inputs: { dry_run: 'true' } });
  assert.equal(r.Function.Properties.Environment.Variables.LINKS_BOOKMARK_INBOX['Fn::If'][0], 'ActiveLinksBookmarks');
});
