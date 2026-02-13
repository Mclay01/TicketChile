"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Event } from "@/lib/events";
import { formatCLP } from "@/lib/events";

type HoldItem = { ticketTypeId: string; qty: number };
type PayMethod = "webpay" | "flow" | "fintoc" | "transfer";

/* ----------------------------
   Validaciones / Normalización
----------------------------- */

function normalizeEmail(v: string) {
  return String(v || "").trim().toLowerCase();
}

function isEmailValid(s: string) {
  const v = normalizeEmail(s);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function normalizePhoneCL(input: string) {
  const raw = String(input || "").replace(/[^\d+]/g, "").trim();
  let digits = raw.startsWith("+") ? raw.slice(1).replace(/\D/g, "") : raw.replace(/\D/g, "");
  if (digits.startsWith("56")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return digits;
}

function formatPhoneCLForDisplay(digits: string) {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.length === 9 && d.startsWith("9")) return `+56 ${d[0]} ${d.slice(1, 5)} ${d.slice(5)}`;
  if (d.length === 8) return `+56 ${d.slice(0, 4)} ${d.slice(4)}`;
  if (!d) return "";
  return `+56 ${d}`;
}

function isPhoneValidCL(input: string) {
  const d = normalizePhoneCL(input);
  return d.length === 9 || d.length === 8;
}

/* ----------------------------
   RUT: validar + formatear
----------------------------- */

function rutClean(rut: string) {
  return String(rut || "")
    .toUpperCase()
    .replace(/[^0-9K]/g, "");
}

function rutComputeDV(num: string) {
  let sum = 0;
  let mul = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    sum += parseInt(num[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return "0";
  if (mod === 10) return "K";
  return String(mod);
}

function rutIsValid(rut: string) {
  const c = rutClean(rut);
  if (c.length < 2) return false;
  const dv = c.slice(-1);
  const num = c.slice(0, -1);
  if (!/^\d+$/.test(num)) return false;
  const dvExpected = rutComputeDV(num);
  return dv === dvExpected;
}

function rutFormat(rut: string) {
  const c = rutClean(rut);
  if (c.length < 2) return rut.trim();
  const dv = c.slice(-1);
  let num = c.slice(0, -1);

  let out = "";
  while (num.length > 3) {
    out = `.${num.slice(-3)}${out}`;
    num = num.slice(0, -3);
  }
  out = `${num}${out}-${dv}`;
  return out;
}

/* ----------------------------
   Regiones / Comunas (Chile)
----------------------------- */

type Region = { code: string; name: string; comunas: string[] };

const CHILE_REGIONES: Region[] = [
  {
    code: "RM",
    name: "Región Metropolitana de Santiago",
    comunas: [
      "Cerrillos",
      "Cerro Navia",
      "Conchalí",
      "El Bosque",
      "Estación Central",
      "Huechuraba",
      "Independencia",
      "La Cisterna",
      "La Florida",
      "La Granja",
      "La Pintana",
      "La Reina",
      "Las Condes",
      "Lo Barnechea",
      "Lo Espejo",
      "Lo Prado",
      "Macul",
      "Maipú",
      "Ñuñoa",
      "Pedro Aguirre Cerda",
      "Peñalolén",
      "Providencia",
      "Pudahuel",
      "Quilicura",
      "Quinta Normal",
      "Recoleta",
      "Renca",
      "San Joaquín",
      "San Miguel",
      "San Ramón",
      "Santiago",
      "Vitacura",
      "Puente Alto",
      "San Bernardo",
      "Colina",
      "Lampa",
      "Tiltil",
      "Buin",
      "Paine",
      "Melipilla",
      "Talagante",
    ],
  },
  {
    code: "V",
    name: "Región de Valparaíso",
    comunas: [
      "Valparaíso",
      "Viña del Mar",
      "Quilpué",
      "Villa Alemana",
      "Concón",
      "Quintero",
      "Puchuncaví",
      "Casablanca",
      "San Antonio",
      "Cartagena",
      "El Quisco",
      "El Tabo",
      "Algarrobo",
      "Santo Domingo",
      "Los Andes",
      "San Felipe",
      "La Calera",
      "Quillota",
    ],
  },
  {
    code: "VIII",
    name: "Región del Biobío",
    comunas: ["Concepción", "Talcahuano", "San Pedro de la Paz", "Chiguayante", "Coronel", "Los Ángeles"],
  },
  {
    code: "X",
    name: "Región de Los Lagos",
    comunas: ["Puerto Montt", "Puerto Varas", "Osorno", "Castro", "Ancud"],
  },
];

/* ----------------------------
   Carrito
----------------------------- */

function parseCartParam(s: string) {
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

/* ----------------------------
   Component
----------------------------- */

export default function CheckoutBuyerForm({ event }: { event: Event }) {
  const router = useRouter();
  const sp = useSearchParams();
  const canceled = sp.get("canceled") === "1";

  const { data: session } = useSession();
  const sessionEmail = normalizeEmail(session?.user?.email || "");

  // buyer fields
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerRut, setBuyerRut] = useState("");

  // Dirección (Chile)
  const [buyerRegion, setBuyerRegion] = useState("");
  const [buyerComuna, setBuyerComuna] = useState("");
  const [buyerAddress1, setBuyerAddress1] = useState("");
  const [buyerAddress2, setBuyerAddress2] = useState("");

  // comprar para otro correo
  const [useOtherEmail, setUseOtherEmail] = useState(false);

  useEffect(() => {
    if (!sessionEmail) return;
    if (!useOtherEmail) setBuyerEmail(sessionEmail);
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

  // Region->Comunas
  const comunasDisponibles = useMemo(() => {
    const r = CHILE_REGIONES.find((x) => x.code === buyerRegion);
    return r ? r.comunas : [];
  }, [buyerRegion]);

  useEffect(() => {
    if (!buyerRegion) {
      if (buyerComuna) setBuyerComuna("");
      return;
    }
    if (buyerComuna && !comunasDisponibles.includes(buyerComuna)) {
      setBuyerComuna("");
    }
  }, [buyerRegion, buyerComuna, comunasDisponibles]);

  // Validaciones
  const emailOk = isEmailValid(buyerEmail);
  const phoneOk = isPhoneValidCL(buyerPhone);

  const rutProvided = buyerRut.trim().length > 0;
  const rutOk = !rutProvided ? true : rutIsValid(buyerRut);

  const addressOk = buyerRegion.trim().length > 0 && buyerComuna.trim().length > 0 && buyerAddress1.trim().length >= 5;

  const canPay =
    !paying &&
    totalQty > 0 &&
    subtotal > 0 &&
    buyerName.trim().length >= 2 &&
    emailOk &&
    phoneOk &&
    rutOk &&
    addressOk;

  function submitWebpayForm(url: string, token: string) {
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

  function payloadBase() {
    return {
      eventId: event.id,
      items,
      buyerName: buyerName.trim(),
      buyerEmail: normalizeEmail(buyerEmail),
      buyerPhone: normalizePhoneCL(buyerPhone),
      buyerRut: buyerRut.trim() ? rutFormat(buyerRut.trim()) : "",
      buyerRegion: buyerRegion.trim(),
      buyerComuna: buyerComuna.trim(),
      buyerAddress1: buyerAddress1.trim(),
      buyerAddress2: buyerAddress2.trim(),
    };
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
        body: JSON.stringify(payloadBase()),
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

  async function payWithFlow() {
    setPayErr(null);
    setOkMsg(null);
    if (!canPay) return;

    setPaying(true);
    try {
      setOkMsg("Abriendo Flow…");

      const res = await fetch(`/api/payments/flow/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payloadBase()),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || data?.detail || `Error ${res.status}`);

      const checkoutUrl = String(data?.checkoutUrl || "");
      if (!checkoutUrl) throw new Error("Flow no devolvió checkoutUrl.");

      window.location.href = checkoutUrl;
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
        body: JSON.stringify(payloadBase()),
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
        body: JSON.stringify(payloadBase()),
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
      : payMethod === "flow"
        ? payWithFlow
        : payMethod === "fintoc"
          ? payWithFintoc
          : payWithTransfer;

  const payBtnText = paying ? "Procesando..." : payMethod === "flow" ? "Pagar con Flow" : "Pagar";

  const whyBlocked = useMemo(() => {
    const reasons: string[] = [];
    if (buyerName.trim().length < 2) reasons.push("Nombre inválido");
    if (!emailOk) reasons.push("Email inválido");
    if (!phoneOk) reasons.push("Teléfono inválido");
    if (!rutOk) reasons.push("RUT inválido");
    if (!buyerRegion.trim()) reasons.push("Falta región");
    if (!buyerComuna.trim()) reasons.push("Falta comuna");
    if (buyerAddress1.trim().length < 5) reasons.push("Falta dirección");
    if (totalQty <= 0) reasons.push("Carrito vacío");
    return reasons;
  }, [buyerName, emailOk, phoneOk, rutOk, buyerRegion, buyerComuna, buyerAddress1, totalQty]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      {/* Datos comprador */}
      <section className="rounded-3xl border border-white/10 bg-black/20 p-6 shadow-2xl backdrop-blur-sm">
        {canceled ? (
          <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="font-semibold text-white/90">Pago cancelado</p>
            <p className="mt-1 text-sm text-white/70">No se cobró nada. Si fue un error, intenta nuevamente.</p>
          </div>
        ) : null}

        <h2 className="text-lg font-semibold text-white">Datos del comprador</h2>
        <p className="mt-1 text-sm text-white/60">El QR y la confirmación se enviarán a este correo.</p>

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
            inputMode="tel"
          />

          <input
            value={buyerRut}
            onChange={(e) => setBuyerRut(e.target.value)}
            onBlur={() => {
              if (buyerRut.trim()) setBuyerRut(rutFormat(buyerRut));
            }}
            placeholder="RUT (obligatorio)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
            disabled={paying}
          />

          <select
            value={buyerRegion}
            onChange={(e) => setBuyerRegion(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
            disabled={paying}
          >
            <option value="">Región</option>
            {CHILE_REGIONES.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            value={buyerComuna}
            onChange={(e) => setBuyerComuna(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
            disabled={paying || !buyerRegion}
          >
            <option value="">{buyerRegion ? "Comuna" : "Selecciona región primero"}</option>
            {comunasDisponibles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            value={buyerAddress1}
            onChange={(e) => setBuyerAddress1(e.target.value)}
            placeholder="Dirección (calle y número)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 md:col-span-2"
            disabled={paying}
          />

          <input
            value={buyerAddress2}
            onChange={(e) => setBuyerAddress2(e.target.value)}
            placeholder="Depto / Casa / Referencia (opcional)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 md:col-span-2"
            disabled={paying}
          />
        </div>

        <div className="mt-4 space-y-2 text-xs text-white/55">
          {buyerPhone.trim() ? <div>Teléfono detectado: {formatPhoneCLForDisplay(normalizePhoneCL(buyerPhone))}</div> : null}
          {buyerRut.trim() ? (
            <div className={rutOk ? "text-white/55" : "text-red-300"}>
              RUT: {rutFormat(buyerRut)} {rutOk ? "✓" : "✗"}
            </div>
          ) : null}
        </div>

        {!totalQty ? (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="font-semibold text-white">Carrito vacío</p>
            <p className="mt-1 text-sm text-white/70">Vuelve al evento y selecciona tickets antes de pagar.</p>
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
            <span className="text-sm font-semibold text-white">${formatCLP(subtotal)}</span>
          </div>

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
                    checked={payMethod === "flow"}
                    onChange={() => setPayMethod("flow")}
                    disabled={paying}
                  />
                  <span className="text-sm text-white/85">Transferencia (Flow)</span>
                </div>
                <span className="text-xs text-white/55">Banco</span>
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
            {payBtnText}
          </button>

          {!canPay ? (
            <p className="mt-3 text-xs text-white/50">
              Completa nombre, email, teléfono, RUT y dirección (región + comuna + dirección).{" "}
              {whyBlocked.length ? `Falta: ${whyBlocked.join(", ")}.` : ""}
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
