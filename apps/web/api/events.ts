// apps/web/api/events.ts
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  // ✅ evita el error TS de "process"
  const env = (globalThis as any).process?.env ?? {};

  const upstream =
    env.VITE_API_URL || 'https://ticket-chile-api.onrender.com/api';

  const base = String(upstream).replace(/\/$/, '');
  const url = `${base}/events`;

  try {
    const upstreamRes = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!upstreamRes.ok) {
      res.statusCode = upstreamRes.status;
      return res.json({ error: `Upstream error ${upstreamRes.status}` });
    }

    const data = await upstreamRes.json();

    // ✅ cache en CDN de Vercel (clave para que deje de pegarle a Render)
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=600',
    );

    return res.status(200).json(data);
  } catch (e: any) {
    res.statusCode = 500;
    return res.json({ error: e?.message ?? 'Failed to fetch events' });
  }
}
