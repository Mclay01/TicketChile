import 'server-only';

// Pure presence/format validation. No connection, credential output or provider calls.
export function coreConfigurationIssues(env: NodeJS.ProcessEnv = process.env): string[] {
  const issues: string[] = [];
  const key = env.SECURITY_DATA_KEY || '';
  if (Buffer.from(key, 'base64').length !== 32 || Buffer.from(key, 'base64').toString('base64') !== key) issues.push('SECURITY_DATA_KEY');
  if ((env.NEXTAUTH_SECRET || '').length < 32) issues.push('NEXTAUTH_SECRET');
  if ((env.TICKETCHILE_QR_SECRET || '').length < 32) issues.push('TICKETCHILE_QR_SECRET');
  for (const name of ['APP_BASE_URL', 'NEXTAUTH_URL']) {
    try {
      const url = new URL(env[name] || '');
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw Error();
    } catch { issues.push(name); }
  }
  return issues;
}
