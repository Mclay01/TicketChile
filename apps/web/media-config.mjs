// Shared by the server adapter and CSP. No values are exported to browser code.
export function mediaConfig(env = process.env) {
  const provider = env.MEDIA_PROVIDER || (env.NODE_ENV === 'production' ? 'disabled' : 'local');
  const unavailable = () => { throw new Error('Invalid media configuration'); };
  const number = (key, fallback, min, max) => {
    const n = env[key] ? Number(env[key]) : fallback;
    if (!Number.isSafeInteger(n) || n < min || n > max) unavailable();
    return n;
  };
  const bounds = { maxBytes: number('MEDIA_MAX_BYTES', 5242880, 1024, 5242880),
    maxPending: number('MEDIA_MAX_PENDING', 30, 3, 100), graceHours: number('MEDIA_GRACE_HOURS', 168, 24, 2160),
    processingConcurrency: number('MEDIA_PROCESSING_CONCURRENCY', 2, 1, 4) };
  if (provider === 'disabled') return { provider, ...bounds };
  if (provider === 'local') {
    if (env.NODE_ENV === 'production' || ['preview', 'production'].includes(env.VERCEL_ENV)) unavailable();
    return { provider, namespace: 'local', ...bounds };
  }
  if (provider !== 's3') unavailable();
  const stage = env.MEDIA_ENVIRONMENT;
  if (!['development', 'preview', 'production'].includes(stage)) unavailable();
  if (env.VERCEL_ENV && env.VERCEL_ENV !== stage) unavailable();
  // Non-Vercel hosts must independently declare their deployment stage.
  if (!env.VERCEL_ENV && env.APP_ENVIRONMENT !== stage) unavailable();
  const bucket = env.MEDIA_S3_BUCKET || '', region = env.MEDIA_S3_REGION || '';
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !bucket.startsWith(`ticketchile-${stage}-`) || !/^[a-z0-9-]{2,40}$/.test(region)) unavailable();
  let endpoint;
  if (env.MEDIA_S3_ENDPOINT) {
    const u = new URL(env.MEDIA_S3_ENDPOINT);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash || !/^[a-z0-9.-]+$/.test(u.hostname) || u.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) unavailable();
    endpoint = u.origin;
  }
  const accessKeyId = env.MEDIA_S3_ACCESS_KEY_ID, secretAccessKey = env.MEDIA_S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) unavailable();
  const origin = endpoint || `https://${bucket}.s3.${region}.amazonaws.com`;
  return { provider, stage, bucket, region, endpoint, origin, accessKeyId, secretAccessKey,
    namespace: `${stage}/v1`, ...bounds };
}

export function mediaImageOrigin(env = process.env) {
  try { const config = mediaConfig(env); return config.provider === 's3' ? config.origin : ''; }
  catch { return ''; } // Invalid/disabled configuration never widens CSP.
}
