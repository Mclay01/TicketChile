export const MEDIA_FALLBACK = "/media-placeholder.svg";
/** Compatibility reader only. Uploads must use the binary media boundary. */
export function mediaSource(value: unknown): string {
  if (typeof value !== "string") return MEDIA_FALLBACK;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 7_000_000) return value;
  if (value.length <= 500 && /^\/(?:events|banners|media|api\/media|api\/event-media|api\/event-preview-media)\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes("..")) return value;
  return MEDIA_FALLBACK;
}
export function eventMedia(value: unknown, id: string, slot = "poster") {
  const safe = mediaSource(value);
  return safe.startsWith("data:") ? `/api/event-media/${encodeURIComponent(id)}/${slot}` : safe;
}
