import { requireEventAccess } from '@/lib/event-access.server';
import { limit } from '@/lib/security/rate-limit.server';
import { accessResponse, privateJson, requireSameOrigin, identifier, AccessError } from '@/lib/access.server';
import { mediaStore, mediaSettings, readImageBody } from '@/lib/media-storage.server';
import { mediaPurposes, type MediaPurpose } from '@/lib/media-keys';
import { persistMedia } from '@/lib/media-lifecycle.server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const params = new URL(request.url).searchParams, eventId = params.get('eventId');
    if (!identifier(eventId)) throw new AccessError(400, 'INVALID_INPUT', 'Crea el borrador antes de cargar una imagen.');
    const access = await requireEventAccess(eventId!, 'event.edit');
    const purpose = params.get('purpose') as MediaPurpose;
    if (!mediaPurposes.includes(purpose)) throw new AccessError(400, 'INVALID_PURPOSE', 'Selecciona el tipo de imagen.');
    const requestKey = request.headers.get('idempotency-key') || '';
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) throw new AccessError(400, 'INVALID_KEY', 'Reintenta desde el editor.');
    await limit('media-upload', access.organizerId, { hits: 30, seconds: 3600 });
    const store = mediaStore();
    const bytes = await readImageBody(request, mediaSettings().maxBytes);
    const result = await persistMedia({ eventId:eventId!, organizerId:access.organizerId, actor:access.actor, purpose, requestKey, bytes, mime:request.headers.get('content-type')! }, store);
    return privateJson(201, { ok: true, ...result });
  } catch (error) { return accessResponse(error); }
}
