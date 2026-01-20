"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Event, TicketType } from "@/lib/events";
import { formatCLP } from "@/lib/events";

type QtyMap = Record<string, number>;
type RemainingMap = Record<string, number>;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function EventTicketSelector({ event }: { event: Event }) {
  const router = useRouter();
  const API_PREFIX = process.env.NEXT_PUBLIC_TICKET_API_PREFIX || "/api/demo";

  const MAX_PER_TYPE = 10;

  const [qty, setQty] = useState<QtyMap>(() => {
    const init: QtyMap = {};
    for (const tt of event.ticketTypes) init[tt.id] = 0;
    return init;
  });

  const [remaining, setRemaining] = useState<RemainingMap>({});
  const [loadingStock, setLoadingStock] = useState(true);
  const [stockErr, setStockErr] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    const init: QtyMap = {};
    for (const tt of event.ticketTypes) init[tt.id] = 0;
    setQty(init);

    setRemaining({});
    setLoadingStock(true);
    setStockErr(null);
    hasLoadedOnceRef.current = false;
  }, [event.id, event.ticketTypes]);

  const abortRef = useRef<AbortController | null>(null);

  const refreshStockNow = useCallback(async () => {
    setStockErr(null);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoadingStock(!hasLoadedOnceRef.current);

    try {
      const r = await fetch(
        `${API_PREFIX}/remaining?eventId=${encodeURIComponent(event.id)}`,
        { cache: "no-store", signal: ac.signal }
      );
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);

      setRemaining(data?.remainingByTicketTypeId ?? {});
      hasLoadedOnceRef.current = true;
    } catch (e: any) {
      if (String(e?.name) !== "AbortError") setStockErr(String(e?.message || e));
    } finally {
      setLoadingStock(false);
    }
  }, [API_PREFIX, event.id]);

  useEffect(() => {
    refreshStockNow();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, API_PREFIX]);

  const lines = useMemo(() => {
    return event.ticketTypes.map((tt) => {
      const avail =
        typeof remaining[tt.id] === "number"
          ? remaining[tt.id]
          : Number.POSITIVE_INFINITY;

      const q = qty[tt.id] ?? 0;
      const isOut = Number.isFinite(avail) ? avail <= 0 : false;
      const lineTotal = q * tt.priceCLP;

      return { tt, avail, q, isOut, lineTotal };
    });
  }, [event.ticketTypes, qty, remaining]);

  const subtotal = useMemo(() => lines.reduce((acc, l) => acc + l.lineTotal, 0), [lines]);
  const total = subtotal;
  const totalQty = useMemo(() => lines.reduce((acc, l) => acc + l.q, 0), [lines]);

  function setTicketQty(tt: TicketType, next: number) {
    const avail = typeof remaining[tt.id] === "number" ? remaining[tt.id] : 999999;
    const cap = Math.min(avail, MAX_PER_TYPE);
    const safe = Number.isFinite(next) ? next : 0;
    setQty((prev) => ({ ...prev, [tt.id]: clamp(safe, 0, cap) }));
  }

  const cartParam = useMemo(() => {
    return lines
      .filter((l) => l.q > 0)
      .map((l) => `${l.tt.id}:${l.q}`)
      .join(",");
  }, [lines]);

  const canContinue = totalQty > 0 && total > 0;

  return (
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(239,68,68,0.18),rgba(0,0,0,0.35))] p-6 shadow-[0_25px_70px_rgba(0,0,0,0.35)] backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Selecciona tus tickets</h3>
          <p className="mt-1 text-xs text-white/70">El pago se hace en el checkout.</p>
        </div>

        <button
          type="button"
          onClick={refreshStockNow}
          disabled={loadingStock}
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80 hover:bg-black/25 disabled:opacity-40"
          title="Recargar stock"
        >
          {loadingStock ? "…" : "↻"}
        </button>
      </div>

      {stockErr ? (
        <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4">
          <p className="text-sm font-semibold text-white">Aviso</p>
          <p className="mt-1 text-xs text-white/80">{stockErr}</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {lines.map(({ tt, avail, q, isOut }) => (
          <div key={tt.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{tt.name}</p>
                <p className="text-xs text-white/70">${formatCLP(tt.priceCLP)}</p>
                <p className="mt-1 text-[11px] text-white/55">
                  {isOut
                    ? "Agotado"
                    : Number.isFinite(avail)
                    ? `Quedan ${avail} • Máx ${Math.min(avail, MAX_PER_TYPE)} por compra`
                    : `Máx ${MAX_PER_TYPE} por compra`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTicketQty(tt, q - 1)}
                  disabled={isOut || q <= 0}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
                >
                  −
                </button>

                <span className="min-w-[18px] text-center text-sm font-semibold text-white">{q}</span>

                <button
                  type="button"
                  onClick={() => setTicketQty(tt, q + 1)}
                  disabled={isOut || (Number.isFinite(avail) && q >= Math.min(avail, MAX_PER_TYPE))}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2 text-sm text-white/85">
        <div className="flex items-center justify-between">
          <span className="text-white/70">Subtotal</span>
          <span className="font-semibold">${formatCLP(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/70">Total</span>
          <span className="font-semibold">${formatCLP(total)}</span>
        </div>
      </div>

      <button
        type="button"
        disabled={!canContinue}
        onClick={() => {
          try {
            sessionStorage.setItem(`tc_cart_${event.id}`, JSON.stringify({ cartParam }));
          } catch {}
          router.push(`/checkout/${event.id}?cart=${encodeURIComponent(cartParam)}`);
        }}
        className="mt-4 w-full rounded-2xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {canContinue ? "Ir al checkout" : "Selecciona al menos un ticket"}
      </button>
    </div>
  );
}
