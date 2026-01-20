"use client";

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingCart, Mail, User, CreditCard, ArrowLeft } from "lucide-react";
import {
  getEventById,
  parseCartString,
  formatCLP,
  formatEventDateLabel,
  formatEventTimeLabel,
} from "@/lib/events";

export default function CheckoutClient({ eventId }: { eventId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const event = getEventById(eventId);

  const cartString = searchParams?.get("cart") || "";
  const cart = parseCartString(cartString);

  const canceled = (searchParams?.get("canceled") || "") === "1";

  const orderSummary = useMemo(() => {
    if (!event) return { items: [] as Array<any>, total: 0 };

    const items = event.ticketTypes
      .map((tt) => {
        const quantity = cart[tt.id] || 0;
        return {
          id: tt.id,
          name: tt.name,
          priceCLP: tt.priceCLP,
          quantity,
          subtotal: tt.priceCLP * quantity,
        };
      })
      .filter((x) => x.quantity > 0);

    const total = items.reduce((sum, x) => sum + x.subtotal, 0);
    return { items, total };
  }, [event, cart]);

  const itemsForApi = useMemo(() => {
    // ✅ Adaptador a tu API: { ticketTypeId, qty }
    return Object.entries(cart)
      .map(([ticketTypeId, qty]) => ({ ticketTypeId, qty: Number(qty) }))
      .filter((x) => x.ticketTypeId && Number.isFinite(x.qty) && x.qty > 0)
      .map((x) => ({ ticketTypeId: x.ticketTypeId, qty: Math.floor(x.qty) }));
  }, [cart]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    if (name.trim().length < 2) return;
    if (!email.includes("@")) return;
    if (orderSummary.total <= 0) return;

    setErr(null);
    setIsProcessing(true);

    try {
      const r = await fetch("/api/payments/stripe/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ Consistente con tu create/route.ts (Modo A)
        body: JSON.stringify({
          eventId: event.id,
          items: itemsForApi,
          buyerName: name.trim(),
          buyerEmail: email.trim(),
        }),
      });

      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);

      // Tu API devuelve: { ok, status, checkoutUrl, holdId, paymentId, sessionId }
      const status = String(data?.status || "");
      const checkoutUrl = String(data?.checkoutUrl || "");

      if (status === "PAID") {
        // Ya estaba pagado (reintento). No hay checkoutUrl.
        router.push(`/eventos/${event.slug}?paid=1`);
        return;
      }

      if (!checkoutUrl) throw new Error("No recibí checkoutUrl desde el server.");

      window.location.assign(checkoutUrl);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setIsProcessing(false);
    }
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-sm border border-slate-700/50 rounded-3xl p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Evento no encontrado</h1>
          <p className="text-slate-400 mb-6">El evento que buscas no existe.</p>
          <Link
            href="/eventos"
            className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors"
          >
            Volver a eventos
          </Link>
        </div>
      </div>
    );
  }

  if (orderSummary.items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-sm border border-slate-700/50 rounded-3xl p-8 max-w-md text-center">
          <ShoppingCart className="w-16 h-16 text-purple-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-4">Carrito vacío</h1>
          <p className="text-slate-400 mb-6">
            Selecciona tickets desde la página del evento para continuar.
          </p>
          <Link
            href={`/eventos/${event.slug}`}
            className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors"
          >
            Seleccionar tickets
          </Link>
        </div>
      </div>
    );
  }

  const dateLabel = formatEventDateLabel(event.dateISO);
  const timeLabel = formatEventTimeLabel(event.dateISO);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950">
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <Link
          href={`/eventos/${event.slug}`}
          className="inline-flex items-center gap-2 text-purple-300 hover:text-purple-200 mb-8 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Volver al evento</span>
        </Link>

        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">Finalizar Compra</h1>

          {canceled ? (
            <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-center">
              <p className="text-white/90 font-semibold">Pago cancelado</p>
              <p className="mt-1 text-sm text-white/70">
                No se realizó ningún cobro. Puedes intentarlo de nuevo.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Formulario */}
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-sm border border-slate-700/50 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <User className="w-7 h-7 text-purple-400" />
                Tus Datos
              </h2>

              {err ? (
                <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-white/90 font-semibold">No se pudo iniciar el pago</p>
                  <p className="mt-1 text-sm text-white/70">{err}</p>
                </div>
              ) : null}

              <form onSubmit={handlePayment} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-purple-200 font-medium mb-2">
                    Nombre Completo
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60" />
                    <input
                      type="text"
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-3 bg-black/30 border border-purple-500/30 rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                      placeholder="Juan Pérez"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-purple-200 font-medium mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60" />
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-3 bg-black/30 border border-purple-500/30 rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                      placeholder="tu@email.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing || !name || !email}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold text-lg rounded-2xl shadow-lg shadow-purple-500/30 transition-all duration-300 transform hover:scale-[1.02] disabled:scale-100 flex items-center justify-center gap-3"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-6 h-6" />
                      Pagar con Stripe
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Resumen */}
            <div className="bg-gradient-to-br from-purple-900/40 to-violet-900/40 backdrop-blur-sm border border-purple-500/20 rounded-3xl p-8 shadow-2xl h-fit">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <ShoppingCart className="w-7 h-7 text-purple-300" />
                Resumen del Pedido
              </h2>

              <div className="mb-6 pb-6 border-b border-purple-400/20">
                <h3 className="text-xl font-semibold text-white mb-2">{event.title}</h3>
                <p className="text-purple-300 text-sm">{dateLabel}</p>
                <p className="text-purple-300 text-sm">{timeLabel}</p>
                <p className="text-purple-300 text-sm">{event.venue}</p>
              </div>

              <div className="space-y-4 mb-6">
                {orderSummary.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center bg-black/20 border border-purple-400/10 rounded-xl p-4"
                  >
                    <div>
                      <p className="text-white font-semibold">{item.name}</p>
                      <p className="text-purple-300 text-sm">
                        {item.quantity} x ${formatCLP(item.priceCLP)}
                      </p>
                    </div>
                    <p className="text-white font-bold text-lg">${formatCLP(item.subtotal)}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-purple-400/20 pt-6">
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold text-2xl">Total</span>
                  <span className="text-purple-300 font-bold text-3xl">
                    ${formatCLP(orderSummary.total)}
                  </span>
                </div>
              </div>

              {/* Debug sutil (si lo quieres, déjalo; si no, bórralo) */}
              <p className="mt-6 text-center text-[11px] text-white/25 break-all">
                cart: {cartString}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
