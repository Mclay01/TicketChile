// apps/web/api/img.ts
import sharp from 'sharp';

const DEFAULT_Q = 72;
const MAX_W = 1600;

const ALLOW_HOSTS = new Set([
  'images.unsplash.com',
  'images.pexels.com',
  'res.cloudinary.com',
  'cdn.discordapp.com',
  'i.imgur.com',
  'ticket-chile-api.onrender.com',
]);

function isAllowed(url: URL) {
  return ALLOW_HOSTS.has(url.host);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const urlParam = String(req.query.url || '');
  const wParam = Number(req.query.w || 800);
  const qParam = Number(req.query.q || DEFAULT_Q);

  if (!urlParam) return res.status(400).send('Missing url');

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return res.status(400).send('Invalid url');
  }

  if (target.protocol !== 'https:') return res.status(400).send('Only https');
  if (!isAllowed(target)) return res.status(403).send('Host not allowed');

  const width = Math.max(240, Math.min(MAX_W, Number.isFinite(wParam) ? wParam : 800));
  const quality = Math.max(40, Math.min(90, Number.isFinite(qParam) ? qParam : DEFAULT_Q));

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TicketChileImageProxy/1.0',
        Accept: 'image/*',
      },
    }).finally(() => clearTimeout(t));

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream image error ${upstream.status}`);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());

    const out = await sharp(buf)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, s-maxage=31536000, immutable');

    return res.status(200).send(out);
  } catch (e: any) {
    return res.status(500).send(e?.message ?? 'Failed to process image');
  }
}
