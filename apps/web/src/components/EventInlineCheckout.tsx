"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/events";
import { formatCLP } from "@/lib/events";

type CartLine = {
  ticketTypeId: string;
  name: string;
  unitPriceCLP: number;
  qty: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function EventInlineCheckout({ event }: { event: Event }) {
  const router = useRouter();
  const MAX_PER_TYPE = 8;

  const hasTypes = Array.isArray(event.ticketTypes) && event.ticketTypes.length > 0;

  const [qtyById, setQtyById] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const tt of event.ticketTypes) init[tt.id] = 0;
    return init;
  });

  const cart = useMemo<CartLine[]>(() => {
    return event.ticketTypes
      .map((tt) => ({
        ticketTypeId: tt.id,
        name: tt.name,
        unitPriceCLP: tt.priceCLP,
        qty: qtyById[tt.id] ?? 0,
      }))
      .filter((x) => x.qty > 0);
  }, [event.ticketTypes, qtyById]);

  const total = useMemo(() => {
    return cart.reduce((acc, x) => acc + x.unitPriceCLP * x.qty, 0);
  }, [cart]);

  const cartParam = useMemo(() => {
    // formato corto y shareable: tt_general:2,tt_vip:1
    return cart.map((x) => `${x.ticketTypeId}:${x.qty}`).join(",");
  }, [cart]);

  function setQty(ticketTypeId: string, next: number) {
    setQtyById((prev) => ({
      ...prev,
      [ticketTypeId]: clamp(next, 0, MAX_PER_TYPE),
    }));
  }

  const canContinue = hasTypes && cart.length > 0;

  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-6 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">Tickets</h3>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          Máx {MAX_PER_TYPE} por tipo
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {!hasTypes ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            No hay tipos de ticket configurados.
          </div>
        ) : (
          event.ticketTypes.map((tt) => {
            const qty = qtyById[tt.id] ?? 0;

            return (
              <div
                key={tt.id}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {tt.name}
                    </p>
                    <p className="text-xs text-white/70">${formatCLP(tt.priceCLP)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty(tt.id, qty - 1)}
                      disabled={qty <= 0}
                      className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-40"
                      aria-label={`Restar ${tt.name}`}
                    >
                      −
                    </button>

                    <span className="min-w-[18px] text-center text-sm font-semibold text-white">
                      {qty}
                    </span>

                    <button
                      type="button"
                      onClick={() => setQty(tt.id, qty + 1)}
                      disabled={qty >= MAX_PER_TYPE}
                      className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-40"
                      aria-label={`Sumar ${tt.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* total + CTA */}
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-white/70">
            TOTAL
          </span>
          <span className="text-sm font-semibold text-white">
            ${formatCLP(total)}
          </span>
        </div>

        <button
          type="button"
          disabled={!canContinue}
          onClick={() => {
            try {
              sessionStorage.setItem(
                `tc_cart_${event.id}`,
                JSON.stringify({ cartParam })
              );
            } catch {}

            router.push(
              `/checkout/${event.id}?cart=${encodeURIComponent(cartParam)}`
            );
          }}
          className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          Continuar
        </button>

        {!canContinue ? (
          <p className="text-xs text-white/50">
            Selecciona al menos 1 ticket para continuar.
          </p>
        ) : null}
      </div>
    </div>
  );
}
