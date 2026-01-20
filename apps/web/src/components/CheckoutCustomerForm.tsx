"use client";

import { useMemo, useState } from "react";
import type { Event } from "@/lib/events";
import { formatCLP } from "@/lib/events";

type CartItem = { ticketTypeId: string; qty: number };

function parseCartParam(cartParam: string): CartItem[] {
  // tt_general:2,tt_vip:1
  const raw = String(cartParam || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, qtyStr] = part.split(":");
      const qty = Number(qtyStr);
      return {
        ticketTypeId: String(id || "").trim(),
        qty: Number.isFinite(qty) ? qty : 0,
      };
    })
    .filter((x) => x.ticketTypeId && x.qty > 0);
}

export default function CheckoutCustomerForm({
  event,
  cartParam,
}: {
  event: Event;
  cartParam: string;
}) {
  const cart = useMemo(() => parseCartParam(cartParam), [cartParam]);

  const summary = useMemo(() => {
    const byId = new Map(event.ticketTypes.map((t) => [t.id, t]));
    const lines = cart
      .map((c) => {
        const tt = byId.get(c.ticketTypeId);
        if (!tt) return null;
        return {
          name: tt.name,
          unit: tt.priceCLP,
          qty: c.qty,
          subtotal: tt.priceCLP * c.qty,
        };
      })
      .filter(Boolean) as Array<{ name: string; unit: number; qty: number; subtotal: number }>;

    const total = lines.reduce((acc, x) => acc + x.subtotal, 0);
    return { lines, total };
  }, [cart, event.ticketTypes]);

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canPay =
    summary.lines.length > 0 && buyerName.trim().length >= 2 && buyerEmail.includes("@");

  async function onPay() {
    setErr(null);
    setLoading(true);
    try {
      if (!canPay) throw new Error("Completa nombre/email y selecciona tickets.");

      // 1) Crear HOLD (re-usa tu backend actual)
      const holdRes = await fetch("/api/demo/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          eventId: event.id,
          items: cart.map((x) => ({ ticketTypeId: x.ticketTypeId, qty: x.qty })),
        }),
      });

      const holdData = await holdRes.json().catch(() => null);
      if (!holdRes.ok) {
        throw new Error(holdData?.error || `No pude crear hold (${holdRes.status}).`);
      }

      const holdId = String(holdData?.holdId || holdData?.id || "");
      if (!holdId) throw new Error("El hold no devolvió holdId.");

      // 2) Crear checkout session Stripe
      const payRes = await fetch("/api/payments/stripe/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          holdId,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
        }),
      });

      const payData = await payRes.json().catch(() => null);
      if (!payRes.ok) {
        throw new Error(payData?.error || `Stripe create falló (${payRes.status}).`);
      }

      const url = String(payData?.checkoutUrl || "");
      if (!url) throw new Error("Stripe no devolvió checkoutUrl.");

      window.location.href = url;
    } catch (e: any) {
      setErr(String(e?.message || e));
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      {/* Resumen MINIMAL (no selector, no invento) */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-white/80">Tu compra</p>

        {summary.lines.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">
            No hay tickets seleccionados. Vuelve al evento y elige tus entradas.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {summary.lines.map((x) => (
              <div
                key={x.name}
                className="flex items-center justify-between text-sm text-white/80"
              >
                <span className="text-white/70">
                  {x.qty}× {x.name}
                </span>
                <span className="font-semibold text-white">
                  ${formatCLP(x.subtotal)}
                </span>
              </div>
            ))}

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-xs font-semibold tracking-wide text-white/70">
                TOTAL
              </span>
              <span className="text-sm font-semibold text-white">
                ${formatCLP(summary.total)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* SOLO datos del cliente */}
      <div className="mt-5 grid gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <label className="text-xs font-semibold text-white/70">Nombre</label>
          <input
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Tu nombre"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <label className="text-xs font-semibold text-white/70">Email</label>
          <input
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            placeholder="tu@email.com"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30"
          />
        </div>

        {err ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm font-semibold text-white">Error</p>
            <p className="mt-1 text-sm text-white/70">{err}</p>
          </div>
        ) : null}

        <button
          type="button"
          disabled={!canPay || loading}
          onClick={onPay}
          className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50"
        >
          {loading ? "Abriendo Stripe…" : "Pagar con Stripe"}
        </button>

        <p className="text-center text-xs text-white/40">
          Te redirigimos a Stripe para completar el pago.
        </p>
      </div>
    </div>
  );
}
