"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCLP, remainingFor, type Event } from "@/lib/events";

type Cart = Record<string, number>;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toBase64Url(str: string) {
  // Browser-safe
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default function QuickBuyClient({ event }: { event: Event }) {
  const router = useRouter();

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [cart, setCart] = useState<Cart>(() => {
    // default: 0 para todos
    const c: Cart = {};
    for (const tt of event.ticketTypes) c[tt.id] = 0;
    return c;
  });

  const items = useMemo(() => {
    return event.ticketTypes.map((tt) => {
      const qty = cart[tt.id] ?? 0;
      const remaining = remainingFor(tt);
      return {
        id: tt.id,
        name: tt.name,
        priceCLP: tt.priceCLP,
        capacity: tt.capacity,
        sold: tt.sold,
        remaining,
        qty,
        subtotal: qty * tt.priceCLP,
      };
    });
  }, [event.ticketTypes, cart]);

  const totalQty = useMemo(() => items.reduce((a, x) => a + x.qty, 0), [items]);
  const totalClp = useMemo(() => items.reduce((a, x) => a + x.subtotal, 0), [items]);

  const nameOk = buyerName.trim().length >= 2;
  const emailOk = buyerEmail.includes("@");
  const canCheckout = totalQty > 0 && nameOk && emailOk;

  function inc(id: string) {
    const tt = event.ticketTypes.find((x) => x.id === id);
    if (!tt) return;
    const remaining = remainingFor(tt);
    setCart((prev) => {
      const cur = prev[id] ?? 0;
      const next = clamp(cur + 1, 0, remaining);
      return { ...prev, [id]: next };
    });
  }

  function dec(id: string) {
    setCart((prev) => {
      const cur = prev[id] ?? 0;
      const next = clamp(cur - 1, 0, 999);
      return { ...prev, [id]: next };
    });
  }

  function goCheckout() {
    const payload = {
      buyerName: buyerName.trim(),
      buyerEmail: buyerEmail.trim(),
      items: Object.fromEntries(
        Object.entries(cart).filter(([, q]) => (Number(q) || 0) > 0)
      ),
    };

    const prefill = toBase64Url(JSON.stringify(payload));
    router.push(`/checkout/${encodeURIComponent(event.id)}?prefill=${encodeURIComponent(prefill)}`);
  }

  return (
    <div className="space-y-5">
      {/* Buyer */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-white/80">Datos del comprador</p>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <p className="text-xs text-white/50">Nombre</p>
            <input
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Ej: Pedro Pérez"
              className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-white/35"
            />
            {!nameOk && buyerName.length > 0 ? (
              <p className="mt-1 text-xs text-amber-200/80">Pon tu nombre real (mín 2 caracteres).</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <p className="text-xs text-white/50">Email</p>
            <input
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="tu@email.com"
              className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-white/35"
            />
            {!emailOk && buyerEmail.length > 0 ? (
              <p className="mt-1 text-xs text-amber-200/80">Ese email huele raro 😅</p>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-xs text-white/50">
          El ticket se asocia al email. Si te equivocas, después te tocará llorar (o arreglarlo en DB).
        </p>
      </div>

      {/* Ticket types */}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((x) => {
          const soldOut = x.remaining <= 0;
          return (
            <div
              key={x.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white/90">{x.name}</p>
                  <p className="mt-1 text-xs text-white/60">
                    ${formatCLP(x.priceCLP)} • Quedan {x.remaining}
                  </p>
                </div>

                <span
                  className={[
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    soldOut
                      ? "border-red-500/20 bg-red-500/10 text-red-200"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
                  ].join(" ")}
                >
                  {soldOut ? "Agotado" : "Disponible"}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => dec(x.id)}
                    className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                    aria-label={`Quitar ${x.name}`}
                  >
                    –
                  </button>

                  <span className="w-10 text-center text-sm font-semibold">{x.qty}</span>

                  <button
                    onClick={() => inc(x.id)}
                    disabled={soldOut || x.qty >= x.remaining}
                    className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
                    aria-label={`Agregar ${x.name}`}
                  >
                    +
                  </button>
                </div>

                <p className="text-sm text-white/80">
                  Subtotal: <span className="font-semibold">${formatCLP(x.subtotal)}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumen */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white/80">Resumen</p>
          <p className="text-sm text-white/70">
            Total: <span className="font-semibold text-white">${formatCLP(totalClp)}</span>
          </p>
        </div>

        {totalQty === 0 ? (
          <p className="mt-2 text-sm text-white/60">Elige al menos 1 entrada.</p>
        ) : (
          <div className="mt-3 space-y-1 text-sm text-white/70">
            {items
              .filter((x) => x.qty > 0)
              .map((x) => (
                <div key={x.id} className="flex items-center justify-between">
                  <span>
                    {x.name} × {x.qty}
                  </span>
                  <span className="text-white/80 font-semibold">${formatCLP(x.subtotal)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ✅ BOTÓN FLOTANTE */}
      {totalQty > 0 ? (
        <div className="fixed bottom-3 left-0 right-0 z-50 px-3">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-2xl border border-white/10 bg-black/80 backdrop-blur p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-white/80">
                  <span className="font-semibold">{totalQty}</span> entrada(s) •{" "}
                  <span className="font-semibold text-white">${formatCLP(totalClp)}</span>
                  {!canCheckout ? (
                    <span className="ml-2 text-xs text-amber-200/80">
                      (Completa nombre y email)
                    </span>
                  ) : null}
                </div>

                <button
                  onClick={goCheckout}
                  disabled={!canCheckout}
                  className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-40"
                >
                  Ir a checkout →
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
