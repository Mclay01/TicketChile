// apps/web/api/img.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import sharp from 'sharp';

const DEFAULT_Q = 72;
const MAX_W = 1600;

// 👉 seguridad básica anti-SSRF (ajusta a tus dominios reales)
const ALLOW_HOSTS = new Set([
  'images.unsplash.com',
  'res.cloudinary.com',
  'cdn.discordapp.com',
  'i.imgur.com',
  'ticket-chile-api.onrender.com',
]);

function isAllowed(url: URL) {
  // permite mismo host del sitio (por si usas imágenes propias)
  // y también los de la allowlist
  return ALLOW_HOSTS.has(url.host);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const urlParam = String(req.query.url || '');
  const wParam = Number(req.query.w || 800);
  const qParam = Number(req.query.q || DEFAULT_Q);

  if (!urlParam) {
    res.status(400).send('Missing url');
    return;
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    res.status(400).send('Invalid url');
    return;
  }

  if (target.protocol !== 'https:') {
    res.status(400).send('Only https');
    return;
  }

  if (!isAllowed(target)) {
    res.status(403).send('Host not allowed');
    return;
  }

  const width = Math.max(240, Math.min(MAX_W, Number.isFinite(wParam) ? wParam : 800));
  const quality = Math.max(40, Math.min(90, Number.isFinite(qParam) ? qParam : DEFAULT_Q));

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        // algunos CDNs se ponen mañosos sin user-agent
        'User-Agent': 'TicketChileImageProxy/1.0',
        Accept: 'image/*',
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream image error ${upstream.status}`);
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());

    const out = await sharp(buf)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    // ✅ cache fuerte en CDN (por query url+w+q)
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, s-maxage=31536000, immutable');

    res.status(200).send(out);
  } catch (e: any) {
    res.status(500).send(e?.message ?? 'Failed to process image');
  }
}
