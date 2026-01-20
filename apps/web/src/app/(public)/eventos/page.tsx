import Link from "next/link";
import EventosFilters from "@/components/EventosFilters";
import EventCard from "@/components/EventCard";
import { EVENTS, eventPriceFrom } from "@/lib/events";

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<SearchParams> };

function getString(sp: SearchParams, key: string) {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

function normalizeSort(v: string) {
  return v === "price_asc" || v === "price_desc" || v === "date" ? v : "date";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default async function EventosPage({ searchParams }: Props) {
  const sp = await searchParams;

  const q = getString(sp, "q").trim();
  const city = getString(sp, "city").trim();
  const sort = normalizeSort(getString(sp, "sort").trim() || "date");

  const pageParam = parseInt(getString(sp, "page") || "1", 10);
  const pageSize = 9;

  const cities = Array.from(new Set(EVENTS.map((e) => e.city))).sort((a, b) =>
    a.localeCompare(b, "es")
  );

  const qLower = q.toLowerCase();

  let filtered = EVENTS.filter((e) => {
    const matchesCity = city ? e.city === city : true;
    const matchesQuery = q
      ? `${e.title} ${e.city} ${e.venue}`.toLowerCase().includes(qLower)
      : true;
    return matchesCity && matchesQuery;
  });

  filtered = [...filtered].sort((a, b) => {
    if (sort === "price_asc") return eventPriceFrom(a) - eventPriceFrom(b);
    if (sort === "price_desc") return eventPriceFrom(b) - eventPriceFrom(a);
    return new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime();
  });

  const total = EVENTS.length;
  const shown = filtered.length;

  const totalPages = Math.max(1, Math.ceil(shown / pageSize));
  const page = clamp(Number.isFinite(pageParam) ? pageParam : 1, 1, totalPages);

  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  function hrefForPage(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    if (sort && sort !== "date") params.set("sort", sort);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/eventos?${qs}` : "/eventos";
  }

  return (
    <div className="-mx-6 -my-10 min-h-[calc(100vh-120px)] bg-transparent">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        {/* Header (como mock) */}
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-white">Eventos</h1>
          <p className="text-sm text-white/55">Descubre los mejores eventos en Chile</p>
        </div>

        {/* Barra filtros (una sola pieza, sin “Volver”) */}
        <EventosFilters cities={cities} />


        {/* Conteo chico (mock lo deja sutil) */}
        <div className="text-xs text-white/45">
          Mostrando <span className="text-white/75 font-semibold">{shown}</span> de{" "}
          <span className="text-white/75 font-semibold">{total}</span>
          {" • "}
          Página <span className="text-white/75 font-semibold">{page}</span> /{" "}
          <span className="text-white/75 font-semibold">{totalPages}</span>
        </div>

        {shown === 0 ? (
          <div className="glass-card rounded-3xl p-8">
            <p className="font-semibold text-white/90">No encontramos nada con esos filtros.</p>
            <p className="mt-1 text-sm text-white/60">
              Cambia búsqueda/ciudad/orden o resetea filtros.
            </p>
          </div>
        ) : (
          <>
            {/* Grid posters */}
            <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {paged.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </section>

            {/* Paginación estilo mock (súper discreta) */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <Link
                href={hrefForPage(page - 1)}
                aria-disabled={page <= 1}
                className={`inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm transition-colors ${
                  page <= 1
                    ? "pointer-events-none opacity-40 border-border bg-white/5 text-white/60"
                    : "border-border bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                ← Anterior
              </Link>

              <div className="text-sm text-white/55">
                Página <span className="text-white/80 font-semibold">{page}</span> de{" "}
                <span className="text-white/80 font-semibold">{totalPages}</span>
              </div>

              <Link
                href={hrefForPage(page + 1)}
                aria-disabled={page >= totalPages}
                className={`inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm transition-colors ${
                  page >= totalPages
                    ? "pointer-events-none opacity-40 border-border bg-white/5 text-white/60"
                    : "border-border bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                Siguiente →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
