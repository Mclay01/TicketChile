"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Event } from "@/lib/events";
import { formatCLP } from "@/lib/events";

type HoldItem = { ticketTypeId: string; qty: number };

function isEmailLike(s: string) {
  const v = s.trim();
  return v.length >= 3 && v.includes("@") && v.includes(".");
}

function isPhoneLike(s: string) {
  const v = s.replace(/\s/g, "").trim();
  return v.length >= 8;
}

function parseCartParam(s: string) {
  // "tt_general:2,tt_vip:1"
  const out: Record<string, number> = {};
  const v = (s || "").trim();
  if (!v) return out;

  for (const part of v.split(",")) {
    const [idRaw, qtyRaw] = part.split(":");
    const id = (idRaw || "").trim();
    const q = parseInt((qtyRaw || "").trim(), 10);
    if (!id || !Number.isFinite(q) || q <= 0) continue;
    out[id] = q;
  }
  return out;
}

type PayMethod = "webpay" | "fintoc" | "transfer";

export default function CheckoutBuyerForm({ event }: { event: Event }) {
  const router = useRouter();
  const sp = useSearchParams();
  const canceled = sp.get("canceled") === "1";

  const { data: session } = useSession();
  const sessionEmail = (session?.user?.email || "").toLowerCase().trim();

  // buyer
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerRut, setBuyerRut] = useState("");
  const [buyerComuna, setBuyerComuna] = useState("");

  // ✅ Nuevo: por defecto usamos el correo de sesión (si existe)
  const [useOtherEmail, setUseOtherEmail] = useState(false);

  useEffect(() => {
    if (!sessionEmail) return;

    // Si NO está comprando para otro correo: forzamos email = sesión
    if (!useOtherEmail) {
      setBuyerEmail(sessionEmail);
    }
  }, [sessionEmail, useOtherEmail]);

  const emailLocked = !!sessionEmail && !useOtherEmail;

  const [payMethod, setPayMethod] = useState<PayMethod>("webpay");

  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // cartParam from query or sessionStorage fallback
  const cartParamFromQuery = sp.get("cart") || "";
  const [cartParam, setCartParam] = useState(cartParamFromQuery);

  useEffect(() => {
    if (cartParamFromQuery) {
      setCartParam(cartParamFromQuery);
      return;
    }
    try {
      const raw = sessionStorage.getItem(`tc_cart_${event.id}`);
      const parsed = raw ? JSON.parse(raw) : null;
      const cp = typeof parsed?.cartParam === "string" ? parsed.cartParam : "";
      if (cp) setCartParam(cp);
    } catch {}
  }, [cartParamFromQuery, event.id]);

  const cartMap = useMemo(() => parseCartParam(cartParam), [cartParam]);

  const { items, subtotal, totalQty } = useMemo(() => {
    const typeById = new Map(event.ticketTypes.map((tt) => [tt.id, tt]));
    const list: HoldItem[] = [];
    let qty = 0;
    let sum = 0;

    for (const [ticketTypeId, q] of Object.entries(cartMap)) {
      const tt = typeById.get(ticketTypeId);
      if (!tt) continue;
      list.push({ ticketTypeId, qty: q });
      qty += q;
      sum += q * tt.priceCLP;
    }

    return { items: list, subtotal: sum, totalQty: qty };
  }, [cartMap, event.ticketTypes]);

  const canPay =
    !paying &&
    totalQty > 0 &&
    subtotal > 0 &&
    buyerName.trim().length >= 2 &&
    isEmailLike(buyerEmail) &&
    isPhoneLike(buyerPhone);

  function submitWebpayForm(url: string, token: string) {
    // Webpay exige POST con token_ws
    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "token_ws";
    input.value = token;

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }

  async function payWithWebpay() {
    setPayErr(null);
    setOkMsg(null);
    if (!canPay) return;

    setPaying(true);
    try {
      setOkMsg("Abriendo Webpay…");

      const res = await fetch(`/api/payments/webpay/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          eventId: event.id,
          items,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          buyerPhone: buyerPhone.trim(),
          buyerRut: buyerRut.trim(),
          buyerComuna: buyerComuna.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

      const url = String(data?.webpay?.url || "");
      const token = String(data?.webpay?.token || "");
      if (!url || !token) throw new Error("Webpay no devolvió url/token.");

      submitWebpayForm(url, token);
    } catch (e: any) {
      setPayErr(String(e?.message || e));
      setOkMsg(null);
      setPaying(false);
    }
  }

  async function payWithFintoc() {
    setPayErr(null);
    setOkMsg(null);
    if (!canPay) return;

    setPaying(true);
    try {
      setOkMsg("Abriendo Fintoc…");

      const res = await fetch(`/api/payments/fintoc/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          eventId: event.id,
          items,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          buyerPhone: buyerPhone.trim(),
          buyerRut: buyerRut.trim(),
          buyerComuna: buyerComuna.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

      const checkoutUrl = String(data?.checkoutUrl || "");
      if (!checkoutUrl) throw new Error("Fintoc no devolvió checkoutUrl.");

      window.location.href = checkoutUrl;
    } catch (e: any) {
      setPayErr(String(e?.message || e));
      setOkMsg(null);
      setPaying(false);
    }
  }

  async function payWithTransfer() {
    // tu flujo actual de transferencia (lo dejo intacto)
    setPayErr(null);
    setOkMsg(null);
    if (!canPay) return;

    setPaying(true);
    try {
      setOkMsg("Generando datos de transferencia…");

      const res = await fetch(`/api/payments/transfer/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          eventId: event.id,
          items,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          buyerPhone: buyerPhone.trim(),
          buyerRut: buyerRut.trim(),
          buyerComuna: buyerComuna.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

      const confirmUrl = typeof data?.confirmUrl === "string" ? data.confirmUrl : "";
      if (!confirmUrl) throw new Error("No se pudo iniciar transferencia.");

      router.push(confirmUrl);
    } catch (e: any) {
      setPayErr(String(e?.message || e));
      setOkMsg(null);
    } finally {
      setPaying(false);
    }
  }

  const onPay =
    payMethod === "webpay"
      ? payWithWebpay
      : payMethod === "fintoc"
      ? payWithFintoc
      : payWithTransfer;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      {/* Datos comprador */}
      <section className="rounded-3xl border border-white/10 bg-black/20 p-6 shadow-2xl backdrop-blur-sm">
        {canceled ? (
          <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="font-semibold text-white/90">Pago cancelado</p>
            <p className="mt-1 text-sm text-white/70">
              No se cobró nada. Si fue un error, intenta nuevamente.
            </p>
          </div>
        ) : null}

        <h2 className="text-lg font-semibold text-white">Datos del comprador</h2>
        <p className="mt-1 text-sm text-white/60">
          El QR y la confirmación se enviarán a este correo.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Nombre y apellido"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
            disabled={paying}
          />

          <input
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
            disabled={paying || emailLocked}
          />

          {/* ✅ Nuevo: comprar para otro correo */}
          {sessionEmail ? (
            <div className="md:col-span-2 -mt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-white/70">
                <input
                  type="checkbox"
                  checked={useOtherEmail}
                  onChange={(e) => setUseOtherEmail(e.target.checked)}
                  disabled={paying}
                />
                Comprar para otro correo
              </label>

              <span className="text-white/50">
                {!useOtherEmail
                  ? `Usando correo de sesión: ${sessionEmail}`
                  : "Ojo: si compras para otro correo, ese usuario verá los tickets en su cuenta."}
              </span>
            </div>
          ) : null}

          <input
            value={buyerPhone}
            onChange={(e) => setBuyerPhone(e.target.value)}
            placeholder="Teléfono (WhatsApp)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
            disabled={paying}
          />
          <input
            value={buyerRut}
            onChange={(e) => setBuyerRut(e.target.value)}
            placeholder="RUT (opcional)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
            disabled={paying}
          />

          <input
            value={buyerComuna}
            onChange={(e) => setBuyerComuna(e.target.value)}
            placeholder="Comuna (opcional)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 md:col-span-2"
            disabled={paying}
          />
        </div>

        {!totalQty ? (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="font-semibold text-white">Carrito vacío</p>
            <p className="mt-1 text-sm text-white/70">
              Vuelve al evento y selecciona tickets antes de pagar.
            </p>
          </div>
        ) : null}
      </section>

      {/* Pago */}
      <aside className="lg:sticky lg:top-20 h-fit space-y-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-semibold text-white">Resumen</h3>

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <span className="text-sm text-white/70">
              {totalQty} ticket{totalQty === 1 ? "" : "s"}
            </span>
            <span className="text-sm font-semibold text-white">
              ${formatCLP(subtotal)}
            </span>
          </div>

          {/* Método pago */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-semibold text-white/70">Método de pago</p>

            <div className="mt-2 grid gap-2">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payMethod"
                    checked={payMethod === "webpay"}
                    onChange={() => setPayMethod("webpay")}
                    disabled={paying}
                  />
                  <span className="text-sm text-white/85">Tarjeta (Webpay)</span>
                </div>
                <span className="text-xs text-white/55">Instantáneo</span>
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payMethod"
                    checked={payMethod === "fintoc"}
                    onChange={() => setPayMethod("fintoc")}
                    disabled={paying}
                  />
                  <span className="text-sm text-white/85">Transferencia (Fintoc)</span>
                </div>
                <span className="text-xs text-white/55">Banco</span>
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payMethod"
                    checked={payMethod === "transfer"}
                    onChange={() => setPayMethod("transfer")}
                    disabled={paying}
                  />
                  <span className="text-sm text-white/85">Transferencia (manual)</span>
                </div>
                <span className="text-xs text-white/55">Con referencia</span>
              </label>
            </div>
          </div>

          {payErr ? (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="font-semibold text-white">No se pudo iniciar el pago</p>
              <p className="mt-1 text-sm text-white/70">{payErr}</p>
            </div>
          ) : null}

          {okMsg ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="font-semibold text-white">{okMsg}</p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!canPay}
            onClick={onPay}
            className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {paying ? "Procesando..." : "Pagar"}
          </button>

          {!canPay ? (
            <p className="mt-3 text-xs text-white/50">
              Completa nombre + email + teléfono (y asegúrate de venir con tickets seleccionados).
            </p>
          ) : null}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/75">
          <p className="font-semibold text-white">Qué pasa después</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Pagas</li>
            <li>Te mostramos confirmación</li>
            <li>Se genera tu ticket y aparece en “Mis tickets”</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
