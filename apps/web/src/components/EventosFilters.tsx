"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = { cities: string[] };

function normalizeSort(v: string) {
  return v === "price_asc" || v === "price_desc" || v === "date" ? v : "date";
}

export default function EventosFilters({ cities }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQ = searchParams.get("q") ?? "";
  const urlCity = searchParams.get("city") ?? "";
  const urlSort = normalizeSort(searchParams.get("sort") ?? "date");

  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);

  const hasFilters = useMemo(() => {
    return Boolean((urlQ && urlQ.trim()) || urlCity || (urlSort && urlSort !== "date"));
  }, [urlQ, urlCity, urlSort]);

  function pushWith(next: { q?: string; city?: string; sort?: string }) {
    const params = new URLSearchParams(searchParams.toString());

    // reset page on change
    if (next.q !== undefined || next.city !== undefined || next.sort !== undefined) {
      params.delete("page");
    }

    if (next.q !== undefined) {
      const v = next.q.trim();
      if (!v) params.delete("q");
      else params.set("q", v);
    }

    if (next.city !== undefined) {
      if (!next.city) params.delete("city");
      else params.set("city", next.city);
    }

    if (next.sort !== undefined) {
      const v = normalizeSort(next.sort);
      if (!v || v === "date") params.delete("sort");
      else params.set("sort", v);
    }

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => router.push(url, { scroll: false }));
  }

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (isPending) return;
      if (q !== urlQ) pushWith({ q });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, isPending]);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-4 md:p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_220px_120px] items-center">
        {/* Search pill */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <span className="text-white/45 text-sm">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar eventos, artistas, lugares…"
            className="w-full bg-transparent text-sm text-white/90 outline-none placeholder:text-white/45"
          />
          {q.trim() ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                pushWith({ q: "" });
              }}
              className="rounded-xl px-2 py-1 text-xs text-white/55 hover:bg-white/10 hover:text-white"
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* City */}
        <Select
          value={urlCity || "__all__"}
          onValueChange={(v) => pushWith({ city: v === "__all__" ? "" : v })}
        >
          <SelectTrigger className="border-white/15">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={urlSort} onValueChange={(v) => pushWith({ sort: v })}>
          <SelectTrigger className="border-white/15">
            <SelectValue placeholder="Fecha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Fecha</SelectItem>
            <SelectItem value="price_asc">Precio: menor a mayor</SelectItem>
            <SelectItem value="price_desc">Precio: mayor a menor</SelectItem>
          </SelectContent>
        </Select>

        {/* Reset */}
        <button
          type="button"
          disabled={!hasFilters || isPending}
          onClick={() => {
            setQ("");
            startTransition(() => router.push("/eventos", { scroll: false }));
          }}
          className="rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-sm font-semibold text-white/70 hover:bg-white/[0.09] disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
