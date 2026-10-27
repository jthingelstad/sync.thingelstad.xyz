// Deploy sync.thingelstad.xyz from the Mac as the cloud-engineer identity:
//
//   node tools/deploy.mjs plan          package, upload, show the change set
//   node tools/deploy.mjs apply         ... and execute it, invoke the probe
//                                       once, check the page through CloudFront
//   node tools/deploy.mjs certificate   create or report the ACM certificate
//                                       stack and print the validation record
//
// The same shape as cards.thingelstad.com/tools/deploy.mjs: one stack in
// infra/sync.json, a content-keyed package, a change set every time, and
// infra/deployment.json rewritten with the live ids after an apply. A first
// apply runs in two steps, because the function cannot exist before its code
// bucket does: step one creates the stack with CodeKey empty, step two
// uploads the package and updates the stack with it.
import { ACMClient, DescribeCertificateCommand } from '@aws-sdk/client-acm';
import {
  CloudFormationClient,
  CreateChangeSetCommand,
  DeleteChangeSetCommand,
  DescribeChangeSetCommand,
  DescribeStacksCommand,
  ExecuteChangeSetCommand,
  waitUntilChangeSetCreateComplete,
  waitUntilStackCreateComplete,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageProbe } from './package.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOYMENT = path.join(ROOT, 'infra/deployment.json');
const deployment = JSON.parse(await fs.readFile(DEPLOYMENT, 'utf8'));
const { region } = deployment;

const cfn = new CloudFormationClient({ region });
const s3 = new S3Client({ region });
const sts = new STSClient({ region });
const acm = new ACMClient({ region });
const lambda = new LambdaClient({ region });
const cloudfront = new CloudFrontClient({ region });

const command = process.argv[2] ?? 'plan';
const tags = Object.entries(deployment.stackTags).map(([Key, Value]) => ({ Key, Value }));
const log = (...args) => console.log(...args);

async function identity() {
  const who = await sts.send(new GetCallerIdentityCommand({}));
  if (who.Account !== deployment.account) throw new Error(`Signed in to account ${who.Account}, not ${deployment.account}`);
  if (!/assumed-role\/ProjectsCloudEngineer\/projects-cloud-engineer/.test(who.Arn))
    throw new Error(`Deploys run as the cloud-engineer identity, not ${who.Arn}`);
  log(`as ${who.Arn}`);
}

async function describe(name) {
  try {
    const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: name }));
    return Stacks?.[0] ?? null;
  } catch (error) {
    if (/does not exist/.test(error.message)) return null;
    throw error;
  }
}

const output = (stack, key) => stack?.Outputs?.find((o) => o.OutputKey === key)?.OutputValue ?? '';
const parameter = (stack, key) => stack?.Parameters?.find((p) => p.ParameterKey === key)?.ParameterValue ?? '';

async function changeSet(name, template, parameters, exists) {
  const ChangeSetName = `deploy-${Date.now()}`;
  await cfn.send(
    new CreateChangeSetCommand({
      StackName: name,
      ChangeSetName,
      ChangeSetType: exists ? 'UPDATE' : 'CREATE',
      TemplateBody: JSON.stringify(JSON.parse(template)),
      Parameters: Object.entries(parameters).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })),
      Capabilities: ['CAPABILITY_IAM'],
      Tags: tags,
    }),
  );
  try {
    await waitUntilChangeSetCreateComplete({ client: cfn, maxWaitTime: 300 }, { StackName: name, ChangeSetName });
  } catch (error) {
    const set = await cfn.send(new DescribeChangeSetCommand({ StackName: name, ChangeSetName }));
    if (/didn't contain changes|No updates are to be performed/.test(set.StatusReason ?? '')) {
      await cfn.send(new DeleteChangeSetCommand({ StackName: name, ChangeSetName }));
      return null;
    }
    throw new Error(`change set failed: ${set.StatusReason ?? error.message}`);
  }
  return cfn.send(new DescribeChangeSetCommand({ StackName: name, ChangeSetName }));
}

function show(set) {
  for (const change of set.Changes ?? []) {
    const r = change.ResourceChange;
    log(`  ${r.Action.padEnd(7)} ${r.LogicalResourceId} (${r.ResourceType})${r.Replacement && r.Replacement !== 'False' ? ` replacement=${r.Replacement}` : ''}`);
  }
}

async function execute(name, set, exists) {
  await cfn.send(new ExecuteChangeSetCommand({ StackName: name, ChangeSetName: set.ChangeSetName }));
  const wait = exists ? waitUntilStackUpdateComplete : waitUntilStackCreateComplete;
  await wait({ client: cfn, maxWaitTime: 1800 }, { StackName: name });
  const stack = await describe(name);
  if (!/COMPLETE$/.test(stack.StackStatus) || /ROLLBACK/.test(stack.StackStatus)) throw new Error(`${name} is ${stack.StackStatus}`);
  return stack;
}

async function uploadPackage(bucket, manifest) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: manifest.key }));
    log(`package already in s3://${bucket}/${manifest.key}`);
    return head.VersionId ?? '';
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
  }
  const put = await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: manifest.key, Body: await fs.readFile(manifest.path), ContentType: 'application/zip', ChecksumSHA256: manifest.checksumSha256 }),
  );
  log(`uploaded s3://${bucket}/${manifest.key} (${manifest.size} bytes)`);
  return put.VersionId ?? '';
}

async function issuedCertificate() {
  // The certificate stack stays CREATE_IN_PROGRESS, with no outputs, until
  // the DNS record validates; read the certificate from its resources so an
  // apply that runs in that window still finds an issued certificate.
  const stack = await describe(deployment.stacks.certificate);
  if (!stack) return '';
  const arn = output(stack, 'CertificateArn') || (await certificateArnFromResources(deployment.stacks.certificate));
  if (!arn) return '';
  const { Certificate } = await acm.send(new DescribeCertificateCommand({ CertificateArn: arn }));
  return Certificate?.Status === 'ISSUED' ? arn : '';
}

async function certificate() {
  const name = deployment.stacks.certificate;
  const template = await fs.readFile(path.join(ROOT, 'infra/certificate.json'), 'utf8');
  let stack = await describe(name);
  if (!stack) {
    log(`creating ${name}`);
    const set = await changeSet(name, template, {}, false);
    await cfn.send(new ExecuteChangeSetCommand({ StackName: name, ChangeSetName: set.ChangeSetName }));
    // The create waits on validation, which needs the CNAME below; read the
    // certificate from the stack's resources instead of waiting.
    for (let i = 0; i < 30 && !stack?.Outputs?.length; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      stack = await describe(name);
      if (/FAILED|ROLLBACK/.test(stack?.StackStatus ?? '')) throw new Error(`${name} is ${stack.StackStatus}`);
    }
  }
  const { Certificate } = await acm.send(new DescribeCertificateCommand({ CertificateArn: output(stack, 'CertificateArn') || (await certificateArnFromResources(name)) }));
  log(`certificate ${Certificate.CertificateArn}: ${Certificate.Status}`);
  for (const option of Certificate.DomainValidationOptions ?? []) {
    const record = option.ResourceRecord;
    if (!record) continue;
    log(`\nValidation CNAME for ${option.DomainName} (${option.ValidationStatus}):`);
    log(`  host   ${record.Name}`);
    log(`  value  ${record.Value}`);
  }
  if (Certificate.Status === 'ISSUED') log('\nIssued: run `npm run deploy` to put the alias on the distribution.');
}

async function certificateArnFromResources(name) {
  const { DescribeStackResourcesCommand } = await import('@aws-sdk/client-cloudformation');
  const { StackResources } = await cfn.send(new DescribeStackResourcesCommand({ StackName: name }));
  return StackResources?.find((r) => r.LogicalResourceId === 'Certificate')?.PhysicalResourceId ?? '';
}

async function invokeProbe(functionName) {
  log(`invoking ${functionName}`);
  const result = await lambda.send(new InvokeCommand({ FunctionName: functionName, InvocationType: 'RequestResponse', LogType: 'Tail', Payload: JSON.stringify({ deploy: true }) }));
  const payload = Buffer.from(result.Payload ?? []).toString('utf8');
  if (result.FunctionError) {
    log(Buffer.from(result.LogResult ?? '', 'base64').toString('utf8'));
    throw new Error(`probe failed: ${payload}`);
  }
  log(`probe: ${payload}`);
}

async function uploadStatic(bucket) {
  const put = (Key, Body, ContentType) => s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body, ContentType, CacheControl: 'public, max-age=300' }));
  await put('flows/index.html', await fs.readFile(path.join(ROOT, 'data/flows.html')), 'text/html; charset=utf-8');
  await put('flows.json', await fs.readFile(path.join(ROOT, 'data/flows.json')), 'application/json');
  await put(
    '404.html',
    '<!doctype html><meta charset="utf-8"><title>Not found</title><p>Not found. The sync page is at <a href="/">/</a> and the map at <a href="/flows/">/flows/</a>.</p>',
    'text/html; charset=utf-8',
  );
  log('uploaded /flows/, /flows.json and /404.html');
}

async function healthy(domain, code) {
  const url = `https://${domain}/health.json`;
  for (let i = 0; i < 24; i++) {
    const response = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (response?.ok) {
      const body = await response.json();
      if (body.code === code) return body;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${url} did not report code ${code} within two minutes`);
}

async function apply(execute_) {
  await identity();
  const name = deployment.stacks.sync;
  const template = await fs.readFile(path.join(ROOT, 'infra/sync.json'), 'utf8');
  const manifest = await packageProbe();
  log(`package ${manifest.key} (${manifest.size} bytes)`);
  let stack = await describe(name);
  const certificateArn = await issuedCertificate();
  log(certificateArn ? `certificate issued: ${certificateArn}` : 'no issued certificate: the CloudFront domain serves the page');

  if (!stack) {
    log(`\n${name} does not exist: step one creates the buckets and roles`);
    const set = await changeSet(name, template, { CodeKey: '', CodeVersion: '', CertificateArn: certificateArn, RuntimeSecret: '', PublisherUser: 'wt-archive' }, false);
    show(set);
    if (!execute_) return log('\nplan only; run `npm run deploy` to create it');
    stack = await execute(name, set, false);
    log(`${name} ${stack.StackStatus}`);
  }

  const codeBucket = output(stack, 'CodeBucket');
  const codeVersion = await uploadPackage(codeBucket, manifest);
  const parameters = {
    CodeKey: manifest.key,
    CodeVersion: codeVersion,
    CertificateArn: certificateArn,
    // The stack remembers the app secret's name; SYNC_RUNTIME_SECRET sets or changes it.
    RuntimeSecret: process.env.SYNC_RUNTIME_SECRET ?? parameter(stack, 'RuntimeSecret'),
    PublisherUser: parameter(stack, 'PublisherUser') || 'wt-archive',
    // A routine deploy preserves the explicit sender choice. New senders
    // start off, so a missing key is never resolved during their first deploy.
    EnableButtondown: process.env.SYNC_ENABLE_BUTTONDOWN ?? (parameter(stack, 'EnableButtondown') || 'false'),
    EnableGitHub: process.env.SYNC_ENABLE_GITHUB ?? (parameter(stack, 'EnableGitHub') || 'false'),
    EnableStrava: process.env.SYNC_ENABLE_STRAVA ?? (parameter(stack, 'EnableStrava') || 'false'),
    StravaOwnerId: process.env.SYNC_STRAVA_OWNER_ID ?? parameter(stack, 'StravaOwnerId'),
    ...Object.fromEntries(['Librarian', 'Links', 'Registry'].flatMap((route) => ['Configure', 'Enable'].map((prefix) => [
      `${prefix}${route}Subscriber`, process.env[`SYNC_${prefix.toUpperCase()}_${route.toUpperCase()}_SUBSCRIBER`] ?? (parameter(stack, `${prefix}${route}Subscriber`) || 'false'),
    ]))),
    ApproveLinksJoinRepair: process.env.SYNC_APPROVE_LINKS_JOIN_REPAIR ?? (parameter(stack, 'ApproveLinksJoinRepair') || 'false'),
    ConfigureRegistryLibrarySubscriber: process.env.SYNC_CONFIGURE_REGISTRY_LIBRARY_SUBSCRIBER ?? (parameter(stack, 'ConfigureRegistryLibrarySubscriber') || 'false'),
    EnableRegistryLibrarySubscriber: process.env.SYNC_ENABLE_REGISTRY_LIBRARY_SUBSCRIBER ?? (parameter(stack, 'EnableRegistryLibrarySubscriber') || 'false'),
    RegistryPublisherRole: process.env.SYNC_REGISTRY_PUBLISHER_ROLE ?? parameter(stack, 'RegistryPublisherRole'),
    ...Object.fromEntries(['Weekly', 'Another', 'Librarian', 'Thingy', 'Links'].map((name) => [
      `${name}ReceiverRole`, process.env[`SYNC_${name.toUpperCase()}_RECEIVER_ROLE`] ?? parameter(stack, `${name}ReceiverRole`),
    ])),
  };
  log(`\nchange set for ${name}`);
  const set = await changeSet(name, template, parameters, true);
  if (!set) log('  no changes');
  else show(set);
  if (!execute_) return log('\nplan only; run `npm run deploy` to apply');
  if (set) {
    stack = await execute(name, set, true);
    log(`${name} ${stack.StackStatus}`);
  }

  const functionName = output(stack, 'FunctionName');
  const siteBucket = output(stack, 'SiteBucket');
  const distributionId = output(stack, 'DistributionId');
  const domain = output(stack, 'DistributionDomain');
  log(`publishing bus ${output(stack, 'PublishingBusArn')}`);
  if (output(stack, 'IntakeUrl')) log(`webhook intake ${output(stack, 'IntakeUrl')} (Buttondown enabled: ${parameters.EnableButtondown}; GitHub enabled: ${parameters.EnableGitHub}; Strava enabled: ${parameters.EnableStrava})`);
  await uploadStatic(siteBucket);
  await invokeProbe(functionName);
  await cloudfront.send(
    new CreateInvalidationCommand({ DistributionId: distributionId, InvalidationBatch: { CallerReference: `${manifest.key}-${Date.now()}`, Paths: { Quantity: 1, Items: ['/*'] } } }),
  );
  const health = await healthy(domain, manifest.key);
  log(`https://${domain}/ serves ${health.code} checked ${health.checked_at}`);

  deployment.live = {
    codeKey: manifest.key,
    codeBucket,
    siteBucket,
    functionName,
    distributionId,
    distributionDomain: domain,
    certificateArn,
    deployedAt: new Date().toISOString(),
  };
  await fs.writeFile(DEPLOYMENT, `${JSON.stringify(deployment, null, 2)}\n`);
  log(`wrote infra/deployment.json`);
}

switch (command) {
  case 'plan':
    await apply(false);
    break;
  case 'apply':
    await apply(true);
    break;
  case 'certificate':
    await identity();
    await certificate();
    break;
  default:
    throw new Error(`unknown command ${command}; use plan, apply or certificate`);
}
