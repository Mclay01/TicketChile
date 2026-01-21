// apps/web/src/components/CheckoutTicketSelector.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event, TicketType } from "@/lib/events";
import { formatCLP } from "@/lib/events";
import { useRouter, useSearchParams } from "next/navigation";

type Props = { event: Event; cartString?: string };

type QtyMap = Record<string, number>;
type RemainingMap = Record<string, number>;

type HoldItem = { ticketTypeId: string; qty: number };

type Hold = {
  id: string;
  createdAtISO: string;
  expiresAtISO: string;
  eventId: string;
  status: "ACTIVE" | "CONSUMED" | "EXPIRED" | string;
  items: Array<{
    ticketTypeId: string;
    ticketTypeName: string;
    unitPriceCLP: number;
    qty: number;
  }>;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isEmailLike(s: string) {
  const v = s.trim();
  return v.length >= 3 && v.includes("@") && v.includes(".");
}

function parseCartParam(cartParam: string | null | undefined) {
  // "tt_general:2,tt_vip:1"
  const out: Record<string, number> = {};
  const s = String(cartParam || "").trim();
  if (!s) return out;

  for (const part of s.split(",")) {
    const [idRaw, qtyRaw] = part.split(":");
    const id = (idRaw || "").trim();
    const q = parseInt((qtyRaw || "").trim(), 10);
    if (!id || !Number.isFinite(q)) continue;
    if (q > 0) out[id] = q;
  }
  return out;
}

export default function CheckoutTicketSelector({ event, cartString }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  // Demo: /api/demo, Real: /api (según tu env)
  const API_PREFIX = process.env.NEXT_PUBLIC_TICKET_API_PREFIX || "/api/demo";

  const canceled = sp.get("canceled") === "1";
  const cartParam = sp.get("cart") || "";
  const didApplyCartRef = useRef(false);

  useEffect(() => {
    if (didApplyCartRef.current) return;
    if (!cartParam) return;

    const parsed = parseCartParam(cartParam);
    const keys = Object.keys(parsed);
    if (!keys.length) return;

    setQty((prev) => {
      const next = { ...prev };
      for (const tt of event.ticketTypes) {
        if (typeof parsed[tt.id] === "number") next[tt.id] = parsed[tt.id];
      }
      return next;
    });

    didApplyCartRef.current = true;
  }, [cartParam, event.ticketTypes]);

  const [qty, setQty] = useState<QtyMap>(() => {
    const init: QtyMap = {};
    for (const tt of event.ticketTypes) init[tt.id] = 0;
    return init;
  });

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");

  const [remaining, setRemaining] = useState<RemainingMap>({});
  const [loadingStock, setLoadingStock] = useState(true);
  const [stockErr, setStockErr] = useState<string | null>(null);
  const hasLoadedStockOnceRef = useRef(false);

  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // ---- 1) Precarga desde cart (prop o querystring) ----
  const cartFromQuery = sp.get("cart");
  const initialCart = useMemo(() => {
    const fromProp = parseCartParam(cartString ?? "");
    const fromQuery = parseCartParam(cartFromQuery);
    // prioridad: prop > query (pero normalmente serán iguales)
    return Object.keys(fromProp).length ? fromProp : fromQuery;
  }, [cartString, cartFromQuery]);

  const didApplyInitialCartRef = useRef(false);

  // Reset si cambia evento
  useEffect(() => {
    const init: QtyMap = {};
    for (const tt of event.ticketTypes) init[tt.id] = 0;
    setQty(init);

    setBuyerName("");
    setBuyerEmail("");

    setRemaining({});
    setLoadingStock(true);
    setStockErr(null);
    hasLoadedStockOnceRef.current = false;

    setPaying(false);
    setPayErr(null);
    setOkMsg(null);

    didApplyInitialCartRef.current = false;
  }, [event.id, event.ticketTypes]);

  // Aplica carrito inicial una sola vez por evento
  useEffect(() => {
    if (didApplyInitialCartRef.current) return;
    const keys = Object.keys(initialCart);
    if (!keys.length) return;

    setQty((prev) => {
      const next = { ...prev };
      for (const tt of event.ticketTypes) {
        const q = initialCart[tt.id];
        if (Number.isFinite(q) && q > 0) next[tt.id] = q;
      }
      return next;
    });

    didApplyInitialCartRef.current = true;
  }, [initialCart, event.ticketTypes]);

  // ===== Stock: carga inicial + refresh manual =====
  const abortRef = useRef<AbortController | null>(null);

  const refreshStockNow = useCallback(async () => {
    setStockErr(null);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoadingStock(!hasLoadedStockOnceRef.current);

    try {
      const r = await fetch(
        `${API_PREFIX}/remaining?eventId=${encodeURIComponent(event.id)}`,
        {
          cache: "no-store",
          signal: ac.signal,
        }
      );
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);

      setRemaining(data?.remainingByTicketTypeId ?? {});
      hasLoadedStockOnceRef.current = true;
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

  // Cuando llega remaining, clamp del qty para evitar “me pedí 99 y quedaban 2”
  useEffect(() => {
    if (!Object.keys(remaining).length) return;
    setQty((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const tt of event.ticketTypes) {
        const avail =
          typeof remaining[tt.id] === "number"
            ? remaining[tt.id]
            : Number.POSITIVE_INFINITY;
        if (Number.isFinite(avail)) {
          const clamped = clamp(next[tt.id] ?? 0, 0, Math.max(0, avail));
          if (clamped !== (next[tt.id] ?? 0)) {
            next[tt.id] = clamped;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [remaining, event.ticketTypes]);

  // ===== UI lines =====
  const lines = useMemo(() => {
    return event.ticketTypes.map((tt) => {
      const avail =
        typeof remaining[tt.id] === "number"
          ? remaining[tt.id]
          : Number.POSITIVE_INFINITY;

      const q = qty[tt.id] ?? 0;
      const lineTotal = q * tt.priceCLP;
      const isOut = Number.isFinite(avail) ? avail <= 0 : false;

      return { tt, avail, q, lineTotal, isOut };
    });
  }, [event.ticketTypes, qty, remaining]);

  const totalQty = useMemo(() => lines.reduce((acc, l) => acc + l.q, 0), [lines]);
  const subtotal = useMemo(
    () => lines.reduce((acc, l) => acc + l.lineTotal, 0),
    [lines]
  );

  function setTicketQty(tt: TicketType, next: number) {
    const avail = typeof remaining[tt.id] === "number" ? remaining[tt.id] : 999999; // server valida
    const safe = Number.isFinite(next) ? next : 0;
    setQty((prev) => ({ ...prev, [tt.id]: clamp(safe, 0, avail) }));
  }

  const canPay =
    !paying &&
    totalQty > 0 &&
    buyerName.trim().length >= 2 &&
    isEmailLike(buyerEmail) &&
    subtotal > 0;

  async function payWithStripe() {
    setPayErr(null);
    setOkMsg(null);
    if (!canPay) return;

    setPaying(true);

    try {
      const items: HoldItem[] = lines
        .filter((l) => l.q > 0)
        .map((l) => ({ ticketTypeId: l.tt.id, qty: l.q }));

      const holdRes = await fetch(`${API_PREFIX}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          eventId: event.id,
          items,
          ttlSeconds: 8 * 60,
        }),
      });

      const holdData = await holdRes.json().catch(() => null);
      if (!holdRes.ok)
        throw new Error(holdData?.error || `Error ${holdRes.status}`);

      const hold: Hold | null = holdData?.hold ?? null;
      if (!hold?.id) throw new Error("No se pudo crear hold.");

      setOkMsg("Abriendo Stripe…");

      const stripeRes = await fetch(`/api/payments/stripe/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          holdId: hold.id,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
        }),
      });

      const stripeData = await stripeRes.json().catch(() => null);
      if (!stripeRes.ok)
        throw new Error(stripeData?.error || `Error ${stripeRes.status}`);

      if (String(stripeData?.status || "") === "PAID") {
        router.push(
          `/mis-tickets?email=${encodeURIComponent(buyerEmail.trim())}&paid=1`
        );
        return;
      }

      const checkoutUrl =
        typeof stripeData?.checkoutUrl === "string" ? stripeData.checkoutUrl : "";
      if (!checkoutUrl) throw new Error("Stripe no devolvió checkoutUrl.");

      window.location.href = checkoutUrl;
    } catch (e: any) {
      setPayErr(String(e?.message || e));
      setOkMsg(null);
      await refreshStockNow();
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        {canceled ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="font-semibold text-white/90">Pago cancelado</p>
            <p className="mt-1 text-sm text-white/70">
              No se cobró nada. Si fue un error, intenta nuevamente.
            </p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Selecciona tus tickets</h2>
              <p className="mt-1 text-sm text-white/60">
                Pagas directo. El servidor valida stock al crear el pago.
              </p>
            </div>

            <button
              type="button"
              onClick={refreshStockNow}
              disabled={loadingStock || paying}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              {loadingStock ? "Cargando..." : "Recargar stock"}
            </button>
          </div>

          {stockErr ? (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
              <p className="font-semibold text-white/90">Aviso</p>
              <p className="mt-1 text-sm text-white/70">{stockErr}</p>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {lines.map(({ tt, avail, q, isOut }) => (
              <div
                key={tt.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div>
                  <p className="font-semibold">{tt.name}</p>
                  <p className="text-sm text-white/70">
                    ${formatCLP(tt.priceCLP)} <span className="text-white/40">•</span>{" "}
                    {isOut ? (
                      <span className="text-white">Agotado</span>
                    ) : Number.isFinite(avail) ? (
                      <span className="text-white/70">Quedan {avail}</span>
                    ) : (
                      <span className="text-white/70">Disponible</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTicketQty(tt, q - 1)}
                    disabled={isOut || q <= 0 || paying}
                    className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    −
                  </button>

                  <input
                    value={q}
                    onChange={(e) => setTicketQty(tt, parseInt(e.target.value || "0", 10))}
                    disabled={isOut || paying}
                    inputMode="numeric"
                    className="h-9 w-14 rounded-lg border border-white/10 bg-black/30 text-center text-sm outline-none disabled:opacity-40"
                  />

                  <button
                    type="button"
                    onClick={() => setTicketQty(tt, q + 1)}
                    disabled={isOut || paying || (Number.isFinite(avail) && q >= avail)}
                    className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold">Datos del comprador</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Nombre y apellido"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/40"
              disabled={paying}
            />
            <input
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/40"
              disabled={paying}
            />
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 h-fit">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold">Resumen</h2>

          <div className="mt-4 space-y-2 text-sm">
            {lines
              .filter((l) => l.q > 0)
              .map((l) => (
                <div key={l.tt.id} className="flex justify-between text-white/80">
                  <span>
                    {l.tt.name} × {l.q}
                  </span>
                  <span>${formatCLP(l.lineTotal)}</span>
                </div>
              ))}

            <div className="border-t border-white/10 pt-3 mt-3 flex justify-between">
              <span className="text-white/70">Total</span>
              <span className="font-semibold">${formatCLP(subtotal)}</span>
            </div>
          </div>

          {payErr ? (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="font-semibold">No se pudo iniciar el pago</p>
              <p className="mt-1 text-sm text-white/70">{payErr}</p>
            </div>
          ) : null}

          {okMsg ? (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="font-semibold">{okMsg}</p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!canPay}
            onClick={payWithStripe}
            className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {paying ? "Procesando..." : "Pagar con Stripe"}
          </button>

          {!canPay ? (
            <p className="mt-3 text-xs text-white/50">
              Selecciona tickets y completa nombre + email.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
