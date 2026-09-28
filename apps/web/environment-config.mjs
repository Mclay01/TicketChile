// Server/build configuration only. Never return values in an error or to clients.
const fail = () => { throw new Error('Environment isolation configuration invalid'); };
const parseUrl = value => { try { return new URL(value); } catch { return fail(); } };
const stages = ['development', 'preview', 'production'];
export function deploymentStage(env = process.env) {
  const stage = env.APP_ENVIRONMENT || env.VERCEL_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development');
  if (!stages.includes(stage) || env.VERCEL_ENV && stage !== env.VERCEL_ENV) fail();
  return stage;
}
export function assertOrigins(env = process.env) {
  const stage = deploymentStage(env);
  const parse = value => {
    const u = parseUrl(value || 'invalid');
    if (u.username || u.password || u.pathname !== '/' || u.search || u.hash ||
      (u.protocol !== 'https:' && !(stage === 'development' && u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname)))) fail();
    return u;
  };
  const app = parse(env.APP_BASE_URL);
  if (env.NEXTAUTH_URL && parse(env.NEXTAUTH_URL).origin !== app.origin) fail();
  if (stage === 'development' && !['localhost','127.0.0.1'].includes(app.hostname) && !/\.(test|invalid)$/.test(app.hostname)) fail();
  if (stage === 'preview') {
    if (parse(env.STAGING_ORIGIN).origin !== app.origin ||
      !(app.hostname.endsWith('.vercel.app') || /(^|[.-])(staging|preview)([.-]|$)/.test(app.hostname)) ||
      ['ticketchile.com','www.ticketchile.com'].includes(app.hostname)) fail();
  }
  if (stage === 'production' && (app.hostname.endsWith('.vercel.app') || /(^|[.-])(localhost|staging|preview|test|invalid)([.-]|$)/.test(app.hostname))) fail();
  return app.origin;
}
export function assertDatabaseEnvironment(connectionString, env = process.env) {
  const stage = deploymentStage(env), u = parseUrl(connectionString);
  const database = decodeURIComponent(u.pathname.slice(1));
  if (!['postgres:','postgresql:'].includes(u.protocol) || u.hash) fail();
  // libpq query parameters must never override the inspected endpoint or TLS.
  for (const [key] of u.searchParams) if (!['sslmode','ssl','uselibpqcompat'].includes(key)) fail();
  const local = ['127.0.0.1','localhost','[::1]'].includes(u.hostname);
  if (stage === 'development') {
    if (!local || !/^ticketchile_(test|local|build)(_|$)/.test(database)) fail();
  } else {
    assertOrigins(env);
    if (local || env.DATABASE_RESOURCE_ENVIRONMENT !== stage || env.DATABASE_EXPECTED_HOST !== u.host ||
      env.DATABASE_EXPECTED_NAME !== database || env.DATABASE_SSL !== 'true' || (env.DATABASE_SSL_REJECT_UNAUTHORIZED && env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'true')) fail();
    if (stage === 'preview' && !/^ticketchile_(preview|staging)_/.test(database)) fail();
    if (stage === 'production' && /(^|_)(test|local|build|preview|staging)(_|$)/.test(database)) fail();
  }
}
export function assertProviderEnvironment(provider, env = process.env) {
  const stage = deploymentStage(env), live = stage === 'production';
  // A callback uses the same check even when new checkout creation is disabled.
  if (stage !== 'development') assertOrigins(env);
  if (provider === 'stripe' && !(live ? /^sk_live_/ : /^sk_test_/).test(env.STRIPE_SECRET_KEY || '')) fail();
  if (provider === 'webpay' && env.WEBPAY_ENV !== (live ? 'production' : 'integration')) fail();
  if (provider === 'flow' && env.FLOW_BASE_URL !== (live ? 'https://www.flow.cl/api' : 'https://sandbox.flow.cl/api')) fail();
  const labels = {openai:'AI_RESOURCE_ENVIRONMENT',resend:'MAIL_RESOURCE_ENVIRONMENT',wallet:'WALLET_RESOURCE_ENVIRONMENT'};
  if (labels[provider] && env[labels[provider]] !== stage) fail();
  if (provider === 'resend' && !live && !mailRecipients(env).length) fail();
}
export function mailRecipients(env = process.env) {
  const entries = (env.MAIL_ALLOWED_RECIPIENTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (entries.length > 20 || entries.some(x => !/^[a-z0-9.!#$%&'+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(x))) fail();
  return entries;
}
export function assertMailRecipients(recipients, env = process.env) {
  assertProviderEnvironment('resend', env);
  if (!Array.isArray(recipients) || !recipients.length) fail();
  if (deploymentStage(env) !== 'production') {
    const allowed = new Set(mailRecipients(env));
    if (recipients.some(x => typeof x !== 'string' || !allowed.has(x.toLowerCase()))) fail();
  }
}
export function isolationIssues(env = process.env) {
  const issues = [];
  try { deploymentStage(env); assertOrigins(env); } catch { issues.push('ENVIRONMENT_ORIGIN'); }
  if (deploymentStageSafe(env) !== 'development') {
    for (const key of ['NEXTAUTH_SECRET','TICKETCHILE_QR_SECRET','SECURITY_DATA_KEY']) {
      const value = env[key] || '';
      if (value.length < 32 || /placeholder|synthetic|local-only|development|isolated-build|change.?me|example/i.test(value) || new Set(value).size < 8) issues.push(key);
    }
  }
  return issues;
}
function deploymentStageSafe(env) { try { return deploymentStage(env); } catch { return 'invalid'; } }
