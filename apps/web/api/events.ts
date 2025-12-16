// apps/web/api/events.ts
export const config = { runtime: 'edge' };

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  });
}

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  // ✅ evita TS "process" y funciona en Edge
  const env = (globalThis as any).process?.env ?? {};

  // 👇 SOLO el serverless/edge debería leer UPSTREAM_API_URL (no VITE_*).
  const upstream =
    env.UPSTREAM_API_URL ||
    env.VITE_API_URL || // fallback por si lo dejaste puesto
    'https://ticket-chile-api.onrender.com/api';

  const base = String(upstream).replace(/\/$/, '');
  const url = `${base}/events`;

  // ✅ cache CDN Vercel
  const cacheHeaders = {
    // 5 min cache en edge, y si expira, sirve “stale” mientras revalida
    'cache-control':
      'public, max-age=0, s-maxage=300, stale-while-revalidate=86400, stale-if-error=86400',
  };

  // ✅ timeout para no quedar colgado si Render se pone lento
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstreamRes = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });

    if (!upstreamRes.ok) {
      // Igual mandamos cache headers (sirve para edge behavior)
      return json(
        { error: `Upstream error ${upstreamRes.status}` },
        { status: upstreamRes.status, headers: cacheHeaders },
      );
    }

    // OJO: usamos text() para no rehacer JSON innecesariamente
    const body = await upstreamRes.text();

    return new Response(body, {
      status: 200,
      headers: {
        ...cacheHeaders,
        'content-type': 'application/json; charset=utf-8',
      },
    });
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError';
    return json(
      { error: isTimeout ? 'Upstream timeout' : e?.message ?? 'Failed to fetch events' },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
