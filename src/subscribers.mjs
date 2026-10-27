// Build-time only. The connections and real-work rules are independently opt-in.
export const SUBSCRIBERS = [
  { name: 'Librarian', slug: 'librarian', hop: 10, repo: 'librarian-thing', workflow: 'library-round.yml', source: 'wt-builder', type: 'published', leg: 'archive', key: 'github_librarian_actions_token' },
  { name: 'Links', slug: 'links', hop: 6, repo: 'links.thingelstad.xyz', workflow: 'sync-join.yml', source: 'wt-builder', type: 'published', leg: 'website', key: 'github_links_actions_token' },
  { name: 'Registry', slug: 'registry', hop: 13, repo: 'thingelstad.xyz', workflow: 'sync-rebuild.yml', source: 'github', type: 'pushed', key: 'github_registry_actions_token' },
];

export function dispatchRequest(route, event, repositories) {
  const dry = event?.['detail-type'] === 'ping';
  if (event?.source !== route.source) return null;
  const detail = event.detail;
  if (!dry) {
    if (event['detail-type'] !== route.type || !detail) return null;
    if (route.leg && (detail.product !== 'weekly-thing' || detail.kind !== 'issue' || detail.leg !== route.leg || !/^[1-9][0-9]*$/.test(String(detail.id)))) return null;
    if (!route.leg && (!repositories.includes(detail.repository) || detail.repository === 'jthingelstad/thingelstad.xyz')) return null;
  } else if (detail?.subscriber !== route.slug) return null;
  return {
    ref: 'main',
    inputs: { dry_run: String(dry), ...(route.name === 'Librarian' ? { only: 'weekly', issue: dry ? '' : String(detail.id) } : route.name === 'Registry' ? {repository:dry ? '' : detail.repository} : {}) },
  };
}

const ref = (name) => ({ Ref: name });
const att = (name, field = 'Arn') => ({ 'Fn::GetAtt': [name, field] });
const sub = (value) => ({ 'Fn::Sub': value });
const ruleArn = (route, suffix) => sub(`arn:\${AWS::Partition}:events:\${AWS::Region}:\${AWS::AccountId}:rule/\${PublishingBus}/\${AWS::StackName}-${route.slug}-${suffix}`);

export function subscriberTemplate(flows, repositories) {
  if (!Array.isArray(repositories) || !repositories.length || repositories.some((repo) => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))) throw new Error('Subscriber repositories must be the reviewed public registry');
  const Parameters = {}, Conditions = {}, Resources = {};
  for (const route of SUBSCRIBERS) {
    if (!flows.hops.some((hop) => hop.id === route.hop && hop.notes.includes('Step 8 proposed subscriber'))) throw new Error(`Hop ${route.hop} must describe its subscriber first`);
    for (const prefix of ['Configure', 'Enable']) Parameters[`${prefix}${route.name}Subscriber`] = {
      Type: 'String', Default: 'false', AllowedValues: ['false', 'true'],
      Description: prefix === 'Configure' ? `Create ${route.slug}'s connection and ping-only rehearsal rule after its runtime token and destination workflow exist.` : `Enable real ${route.slug} work only after rehearsal and operator approval.`,
    };
    Conditions[`Has${route.name}Subscriber`] = { 'Fn::And': [{ Condition: 'HasRuntimeSecret' }, { 'Fn::Equals': [ref(`Configure${route.name}Subscriber`), 'true'] }] };
    Conditions[`Runs${route.name}Subscriber`] = { 'Fn::And': [{ Condition: `Has${route.name}Subscriber` }, { 'Fn::Equals': [ref(`Enable${route.name}Subscriber`), 'true'] }, ...(route.name === 'Links' ? [{ 'Fn::Equals': [ref('ApproveLinksJoinRepair'), 'true'] }] : [])] };
    const condition = `Has${route.name}Subscriber`;
    const connection = `${route.name}SubscriberConnection`, destination = `${route.name}SubscriberDestination`, role = `${route.name}SubscriberRole`;
    Resources[connection] = { Type: 'AWS::Events::Connection', Condition: condition, Properties: {
      AuthorizationType: 'API_KEY', Description: `Reviewed workflow dispatch for ${route.repo}; no runtime secret reader.`,
      AuthParameters: { ApiKeyAuthParameters: { ApiKeyName: 'Authorization', ApiKeyValue: sub(`Bearer {{resolve:secretsmanager:\${RuntimeSecret}:SecretString:${route.key}}}`) } },
    } };
    Resources[destination] = { Type: 'AWS::Events::ApiDestination', Condition: condition, Properties: {
      ConnectionArn: att(connection), HttpMethod: 'POST', InvocationRateLimitPerSecond: 1,
      InvocationEndpoint: `https://api.github.com/repos/jthingelstad/${route.repo}/actions/workflows/${route.workflow}/dispatches`,
    } };
    Resources[role] = { Type: 'AWS::IAM::Role', Condition: condition, Properties: {
      AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'events.amazonaws.com' }, Action: 'sts:AssumeRole', Condition: { StringEquals: { 'aws:SourceAccount': ref('AWS::AccountId') }, ArnEquals: { 'aws:SourceArn': [ruleArn(route, 'work'), ruleArn(route, 'ping')] } } }] },
      Policies: [{ PolicyName: 'InvokeOneReviewedWorkflow', PolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 'events:InvokeApiDestination', Resource: att(destination, 'ArnForPolicy') }] } }],
    } };
    for (const dry of [false, true]) {
      const request = { ref: 'main', inputs: { dry_run: String(dry), ...(route.name === 'Librarian' ? { only: 'weekly', issue: dry ? '' : '<issue>' } : route.name === 'Registry' ? {repository:dry ? '' : '<repository>'} : {}) } };
      const target = {
        Id: `${route.slug}-${dry ? 'ping' : 'work'}`, Arn: att(destination), RoleArn: att(role),
        HttpParameters: { HeaderParameters: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' } },
        RetryPolicy: { MaximumEventAgeInSeconds: 3600, MaximumRetryAttempts: 10 }, DeadLetterConfig: { Arn: att('SubscriberDeadLetters') },
      };
      if (route.name === 'Librarian' && !dry) target.InputTransformer = { InputPathsMap: { issue: '$.detail.id' }, InputTemplate: JSON.stringify(request).replace('"<issue>"', '<issue>') };
      else if (route.name === 'Registry' && !dry) target.InputTransformer = {InputPathsMap:{repository:'$.detail.repository'},InputTemplate:JSON.stringify(request).replace('"<repository>"','<repository>')};
      else target.Input = JSON.stringify(request);
      Resources[`${route.name}Subscriber${dry ? 'Ping' : 'Work'}Rule`] = { Type: 'AWS::Events::Rule', Condition: condition, Properties: {
        Name: sub(`\${AWS::StackName}-${route.slug}-${dry ? 'ping' : 'work'}`), EventBusName: ref('PublishingBus'),
        State: dry ? 'ENABLED' : { 'Fn::If': [`Runs${route.name}Subscriber`, 'ENABLED', 'DISABLED'] },
        EventPattern: { source: [route.source], 'detail-type': [dry ? 'ping' : route.type], detail: dry ? { subscriber: [route.slug] } : route.leg ? { product: ['weekly-thing'], kind: ['issue'], leg: [route.leg], id: [{ exists: true }] } : { repository: repositories.filter((repo) => repo !== 'jthingelstad/thingelstad.xyz') } },
        Targets: [target],
      } };
    }
  }
  Parameters.ApproveLinksJoinRepair = { Type: 'String', Default: 'false', AllowedValues: ['false', 'true'], Description: 'Explicit Jamie approval to repair the WT354 join example. Keep false until that decision.' };
  Conditions.HasAnySubscriber = { 'Fn::Or': SUBSCRIBERS.map((route) => ({ Condition: `Has${route.name}Subscriber` })) };
  Resources.SubscriberDeadLetters = { Type: 'AWS::SQS::Queue', Condition: 'HasAnySubscriber', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: { MessageRetentionPeriod: 1209600, SqsManagedSseEnabled: true } };
  Resources.SubscriberDeadLetterPolicy = { Type: 'AWS::SQS::QueuePolicy', Condition: 'HasAnySubscriber', Properties: {
    Queues: [ref('SubscriberDeadLetters')], PolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'events.amazonaws.com' }, Action: 'sqs:SendMessage', Resource: att('SubscriberDeadLetters'), Condition: { StringEquals: { 'aws:SourceAccount': ref('AWS::AccountId') }, ArnEquals: { 'aws:SourceArn': SUBSCRIBERS.flatMap((route) => [ruleArn(route, 'work'), ruleArn(route, 'ping')]) } } }] },
  } };
  return { Parameters, Conditions, Resources };
}
