// apps/web/src/lib/api.ts
export const API_PREFIX = (() => {
  const raw = (process.env.NEXT_PUBLIC_TICKET_API_PREFIX || "").trim();
  const base = raw || "/api/demo"; // default seguro (tu setup actual)
  return base.endsWith("/") ? base.slice(0, -1) : base;
})();

export function apiUrl(path: string) {
  if (!path) return API_PREFIX;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_PREFIX}${p}`;
}
