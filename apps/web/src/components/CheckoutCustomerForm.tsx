"use client";

import { useMemo, useState } from "react";
import type { Event } from "@/lib/events";
import { formatCLP } from "@/lib/events";

type CartItem = { ticketTypeId: string; qty: number };

type PaymentMethod = "webpay" | "fintoc" | "transfer";

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

function getPayButtonLabel(method: PaymentMethod) {
  if (method === "webpay") return "Pagar con Webpay";
  if (method === "fintoc") return "Pagar con Fintoc";
  return "Pagar por transferencia (manual)";
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

  const [method, setMethod] = useState<PaymentMethod>("fintoc"); // puedes dejar "webpay" si quieres
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Si usas transferencia manual, aquí podrías mostrar instrucciones del backend
  const [transferInfo, setTransferInfo] = useState<any>(null);

  const canPay =
    summary.lines.length > 0 && buyerName.trim().length >= 2 && buyerEmail.includes("@");

  async function onPay() {
    setErr(null);
    setTransferInfo(null);
    setLoading(true);

    try {
      if (!canPay) throw new Error("Completa nombre/email y selecciona tickets.");

      // MONTO EN CLP (ENTERO)
      const amount = summary.total;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("amount_invalid_or_missing");
      }

      // 1) Crear HOLD
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
        throw new Error(
          holdData?.error || holdData?.detail || holdData?.message || `No pude crear hold (${holdRes.status}).`
        );
      }

      const holdId = String(holdData?.holdId || holdData?.id || "");
      if (!holdId) throw new Error("El hold no devolvió holdId.");

      // 2) PAGO SEGÚN MÉTODO
      let endpoint = "";
      if (method === "webpay") endpoint = "/api/payments/webpay/create";
      if (method === "fintoc") endpoint = "/api/payments/fintoc/create";
      if (method === "transfer") endpoint = "/api/payments/transfer/create";

      const payRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          // comunes
          holdId,
          amount, // <-- CLAVE (especialmente para fintoc)
          currency: "CLP",
          eventId: event.id,

          // datos cliente
          name: buyerName.trim(),
          buyerName: buyerName.trim(),
          email: buyerEmail.trim(),       // <-- CLAVE (tu backend fintoc exige email o tax_id)
          buyerEmail: buyerEmail.trim(),

          // metadata útil
          metadata: {
            holdId,
            eventId: event.id,
            items: cart,
          },
        }),
      });

      const payData = await payRes.json().catch(() => null);

      if (!payRes.ok) {
        // para que veas el error REAL en UI (no solo "algo falló")
        const msg =
          payData?.error ||
          payData?.detail ||
          payData?.message ||
          payData?.fintoc_error?.message ||
          JSON.stringify(payData);
        throw new Error(msg || `Pago falló (${payRes.status}).`);
      }

      // Si es transferencia manual, quizás NO hay redirect: mostramos instrucciones
      if (method === "transfer") {
        setTransferInfo(payData);
        setLoading(false);
        return;
      }

      // Para fintoc/webpay normalmente viene un redirect
      const url = String(
        payData?.redirect_url ||
          payData?.redirectUrl ||
          payData?.checkoutUrl ||
          payData?.paymentUrl ||
          payData?.url ||
          ""
      );

      if (!url) {
        // Si no hay URL, mostramos lo que devolvió el backend para debug
        throw new Error(`El proveedor no devolvió URL de redirección: ${JSON.stringify(payData)}`);
      }

      window.location.href = url;
    } catch (e: any) {
      setErr(String(e?.message || e));
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      {/* Resumen */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-white/80">Resumen</p>

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
                <span className="font-semibold text-white">${formatCLP(x.subtotal)}</span>
              </div>
            ))}

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-xs font-semibold tracking-wide text-white/70">TOTAL</span>
              <span className="text-sm font-semibold text-white">${formatCLP(summary.total)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Método de pago */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-white/80">Método de pago</p>

        <div className="mt-3 space-y-2">
          <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="paymethod"
                checked={method === "webpay"}
                onChange={() => setMethod("webpay")}
              />
              <span className="text-sm text-white/80">Tarjeta (Webpay)</span>
            </div>
            <span className="text-xs text-white/40">Instantáneo</span>
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="paymethod"
                checked={method === "fintoc"}
                onChange={() => setMethod("fintoc")}
              />
              <span className="text-sm text-white/80">Transferencia (Fintoc)</span>
            </div>
            <span className="text-xs text-white/40">Banco</span>
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="paymethod"
                checked={method === "transfer"}
                onChange={() => setMethod("transfer")}
              />
              <span className="text-sm text-white/80">Transferencia (manual)</span>
            </div>
            <span className="text-xs text-white/40">Con referencia</span>
          </label>
        </div>
      </div>

      {/* Datos cliente */}
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
            <p className="text-sm font-semibold text-white">No se pudo iniciar el pago</p>
            <p className="mt-1 text-sm text-white/70">{err}</p>
          </div>
        ) : null}

        {transferInfo ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white/80">Instrucciones transferencia</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-white/60">
              {JSON.stringify(transferInfo, null, 2)}
            </pre>
          </div>
        ) : null}

        <button
          type="button"
          disabled={!canPay || loading}
          onClick={onPay}
          className="mt-1 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50"
        >
          {loading ? "Iniciando pago…" : getPayButtonLabel(method)}
        </button>

        <p className="text-center text-xs text-white/40">
          {method === "fintoc"
            ? "Te redirigimos a Fintoc para completar el pago."
            : method === "webpay"
            ? "Te redirigimos a Webpay para completar el pago."
            : "Generamos una referencia para pagar por transferencia manual."}
        </p>
      </div>
    </div>
  );
}
