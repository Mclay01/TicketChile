export type SearchValues = Record<string, string | string[] | undefined>;
export type CatalogFilters = { q: string; city: string; category: string; sort: string; when: string; page: number };
const value = (v: string | string[] | undefined, max: number) => typeof v === "string" ? v.trim().replace(/[\u0000-\u001f]/g, "").slice(0, max) : "";
export function catalogFilters(input: SearchValues = {}): CatalogFilters {
  const sort = value(input.sort, 20), when = value(input.when, 20);
  return { q: value(input.q, 120), city: value(input.city, 80), category: value(input.category, 60),
    sort: ["price_asc", "price_desc"].includes(sort) ? sort : "date", when: when === "week" ? "week" : "upcoming",
    page: Math.min(1000, Math.max(1, /^\d{1,4}$/.test(String(input.page)) ? Number(input.page) : 1)) };
}
export function catalogUrl(filters: Partial<CatalogFilters>, path = "/eventos") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && !(key === "page" && value === 1)) params.set(key, String(value));
  return path + (params.size ? `?${params}` : "");
}
export function dateLabel(value: string | Date, time = false) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const : {}) }).format(new Date(value));
}
