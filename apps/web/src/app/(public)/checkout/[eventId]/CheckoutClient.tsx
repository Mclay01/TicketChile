"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShoppingCart,
  Mail,
  User,
  CreditCard,
  ArrowLeft,
  Phone,
  MapPin,
  Landmark,
  BadgeCheck,
} from "lucide-react";
import {
  getEventById,
  parseCartString,
  formatCLP,
  formatEventDateLabel,
  formatEventTimeLabel,
} from "@/lib/events";

type Region = { codigo: string; nombre: string };
type Comuna = { codigo: string; nombre: string };

const DPA_BASE = "https://apis.digital.gob.cl/dpa"; // API DPA (regiones/comunas)

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function onlyDigits(s: string) {
  return String(s || "").replace(/\D+/g, "");
}

/** ---------------------------
 *  API error -> human message
 *  Evita el clásico "[object Object]"
 *  -------------------------- */
function apiErrorToMessage(data: any, status: number, raw?: string) {
  const candidates = [
    data?.error,
    data?.error?.message,
    data?.message,
    data?.details,
    data?.details?.message,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  if (data?.error && typeof data.error === "object") {
    try {
      return JSON.stringify(data.error);
    } catch {}
  }

  const snippet = typeof raw === "string" ? raw.slice(0, 220) : "";
  return snippet ? `Error ${status}: ${snippet}` : `Error ${status}`;
}

/** ---------------------------
 *  RUT (Chile) validation
 *  -------------------------- */
function cleanRut(input: string) {
  return String(input || "")
    .toUpperCase()
    .replace(/[^0-9K]/g, "");
}

function rutDv(num: string) {
  let sum = 0;
  let mul = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    sum += Number(num[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return "0";
  if (mod === 10) return "K";
  return String(mod);
}

function normalizeRut(input: string) {
  const c = cleanRut(input);
  if (c.length < 2) return "";
  const num = c.slice(0, -1);
  const dv = c.slice(-1);
  return `${num}-${dv}`;
}

function formatRut(input: string) {
  const n = normalizeRut(input);
  if (!n) return "";
  const [num, dv] = n.split("-");
  const withDots = num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

function isValidRut(input: string) {
  const n = normalizeRut(input);
  if (!n) return false;
  const [num, dv] = n.split("-");
  if (!num || !dv) return false;
  if (num.length < 7) return false;
  return rutDv(num) === dv;
}

function rutNumberOnly(input: string) {
  // Para Fintoc docs: suelen mandar solo el número (sin DV).
  const n = normalizeRut(input);
  if (!n) return "";
  const [num] = n.split("-");
  return onlyDigits(num);
}

/** ---------------------------
 *  Email anti-typos
 *  -------------------------- */
const COMMON_EMAIL_DOMAIN_FIXES: Array<[RegExp, string]> = [
  [/(@)gmal\.com$/i, "$1gmail.com"],
  [/(@)gmial\.com$/i, "$1gmail.com"],
  [/(@)hotmial\.com$/i, "$1hotmail.com"],
  [/(@)outlok\.com$/i, "$1outlook.com"],
];

function normalizeEmail(input: string) {
  return String(input || "").trim().toLowerCase();
}

function looksLikeEmail(input: string) {
  const e = normalizeEmail(input);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function suggestEmailFix(email: string) {
  let out = email;
  for (const [re, rep] of COMMON_EMAIL_DOMAIN_FIXES) {
    out = out.replace(re, rep);
  }
  return out;
}

/** ---------------------------
 *  Webpay redirect helper
 *  -------------------------- */
function submitToWebpay(url: string, token: string) {
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

export default function CheckoutClient({ eventId }: { eventId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const event = getEventById(eventId);

  const cartString = searchParams?.get("cart") || "";
  const cart = parseCartString(cartString);
  const canceled = (searchParams?.get("canceled") || "") === "1";

  const [paymentMethod, setPaymentMethod] = useState<"webpay" | "fintoc">("webpay");

  // Datos comprador
  const [name, setName] = useState("");
  const [rut, setRut] = useState("");
  const [phone, setPhone] = useState("");

  const [email, setEmail] = useState("");
  const [email2, setEmail2] = useState("");
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  // Dirección (Chile)
  const [regions, setRegions] = useState<Region[]>([]);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [regionCode, setRegionCode] = useState("");
  const [comunaCode, setComunaCode] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");

  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [acceptTerms, setAcceptTerms] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    return Object.entries(cart)
      .map(([ticketTypeId, qty]) => ({ ticketTypeId, qty: Number(qty) }))
      .filter((x) => x.ticketTypeId && Number.isFinite(x.qty) && x.qty > 0)
      .map((x) => ({ ticketTypeId: x.ticketTypeId, qty: Math.floor(x.qty) }));
  }, [cart]);

  // Cargar regiones (DPA)
  useEffect(() => {
    let mounted = true;

    async function loadRegions() {
      setLoadingGeo(true);
      setGeoError(null);
      try {
        const r = await fetch(`${DPA_BASE}/regiones`, { cache: "force-cache" });
        if (!r.ok) throw new Error(`No pude cargar regiones (HTTP ${r.status})`);
        const data = (await r.json()) as Region[];
        if (!Array.isArray(data)) throw new Error("Respuesta inválida al cargar regiones.");
        if (mounted) setRegions(data);
      } catch (e: any) {
        if (mounted) setGeoError(String(e?.message || e));
      } finally {
        if (mounted) setLoadingGeo(false);
      }
    }

    loadRegions();
    return () => {
      mounted = false;
    };
  }, []);

  // Cargar comunas al elegir región
  useEffect(() => {
    let mounted = true;

    async function loadComunas(rc: string) {
      if (!rc) {
        setComunas([]);
        setComunaCode("");
        return;
      }

      setLoadingGeo(true);
      setGeoError(null);
      try {
        const r = await fetch(`${DPA_BASE}/regiones/${encodeURIComponent(rc)}/comunas`, {
          cache: "force-cache",
        });
        if (!r.ok) throw new Error(`No pude cargar comunas (HTTP ${r.status})`);
        const data = (await r.json()) as Comuna[];
        if (!Array.isArray(data)) throw new Error("Respuesta inválida al cargar comunas.");
        if (mounted) setComunas(data);
      } catch (e: any) {
        if (mounted) setGeoError(String(e?.message || e));
      } finally {
        if (mounted) setLoadingGeo(false);
      }
    }

    loadComunas(regionCode);
    return () => {
      mounted = false;
    };
  }, [regionCode]);

  // Email suggestion (anti-typos)
  useEffect(() => {
    const e = normalizeEmail(email);
    if (!e) {
      setEmailSuggestion(null);
      return;
    }
    const fixed = suggestEmailFix(e);
    if (fixed !== e) setEmailSuggestion(fixed);
    else setEmailSuggestion(null);
  }, [email]);

  const regionName = useMemo(
    () => regions.find((x) => x.codigo === regionCode)?.nombre || "",
    [regions, regionCode]
  );
  const comunaName = useMemo(
    () => comunas.find((x) => x.codigo === comunaCode)?.nombre || "",
    [comunas, comunaCode]
  );

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    if (pickString(name).length < 2) errors.name = "Ingresa tu nombre completo.";
    if (!isValidRut(rut)) errors.rut = "RUT inválido (revisa el dígito verificador).";

    const p = onlyDigits(phone);
    if (p.length < 8) errors.phone = "Teléfono inválido (muy corto).";

    const e1 = normalizeEmail(email);
    const e2 = normalizeEmail(email2);
    if (!looksLikeEmail(e1)) errors.email = "Email inválido.";
    if (e2 && e1 !== e2) errors.email2 = "Los emails no coinciden.";

    if (!regionCode) errors.region = "Selecciona región.";
    if (!comunaCode) errors.comuna = "Selecciona comuna.";

    if (pickString(address1).length < 4) errors.address1 = "Dirección muy corta.";
    if (!acceptTerms) errors.terms = "Debes aceptar términos.";

    if (orderSummary.total <= 0) errors.cart = "Carrito inválido.";

    return { ok: Object.keys(errors).length === 0, errors };
  }, [
    name,
    rut,
    phone,
    email,
    email2,
    regionCode,
    comunaCode,
    address1,
    acceptTerms,
    orderSummary.total,
  ]);

  const dateLabel = event ? formatEventDateLabel(event.dateISO) : "";
  const timeLabel = event ? formatEventTimeLabel(event.dateISO) : "";

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    setErr(null);

    if (!validation.ok) {
      setErr("Revisa los campos marcados antes de pagar.");
      return;
    }

    setIsProcessing(true);

    try {
      const endpoint =
        paymentMethod === "webpay"
          ? "/api/payments/webpay/create"
          : "/api/payments/fintoc/create";

      const safeEmail = normalizeEmail(emailSuggestion || email);
      const rutNorm = normalizeRut(rut);
      const rutNumOnly = rutNumberOnly(rut);

      const basePayload: any = {
        eventId: event.id,
        items: itemsForApi,
        buyerName: pickString(name),
        buyerEmail: safeEmail,
        buyerRut: rutNorm,
        buyerPhone: onlyDigits(phone),
        buyerRegion: regionName,
        buyerComuna: comunaName,
        buyerAddress1: pickString(address1),
        buyerAddress2: pickString(address2),
      };

      // ✅ Fintoc exige amount/currency/success_url/cancel_url
      if (paymentMethod === "fintoc") {
        const origin = window.location.origin;

        basePayload.amount = Math.round(Number(orderSummary.total) || 0);
        basePayload.currency = "CLP";

        // URLs de retorno (las usa el backend para crear la sesión)
        basePayload.success_url = `${origin}/checkout/confirm?provider=fintoc`;
        basePayload.cancel_url = `${origin}/checkout/${encodeURIComponent(
          eventId
        )}?canceled=1&cart=${encodeURIComponent(cartString)}`;

        // Customer (según docs v2)
        basePayload.customer = {
          name: pickString(name),
          email: safeEmail,
          tax_id: rutNumOnly
            ? { type: "cl_rut", value: rutNumOnly }
            : undefined,
          metadata: {},
        };

        basePayload.metadata = {
          order: `evt_${event.id}`,
          eventId: event.id,
        };
      }

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload),
      });

      const raw = await r.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!r.ok) {
        throw new Error(apiErrorToMessage(data, r.status, raw));
      }

      if (!data || typeof data !== "object") {
        throw new Error("Respuesta inválida del servidor (no JSON).");
      }

      const status = String(data?.status || "");
      const paymentId = String(data?.paymentId || "");

      if (status === "PAID") {
        if (paymentId) {
          router.push(`/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}`);
        } else {
          router.push(`/eventos/${event.slug}?paid=1`);
        }
        return;
      }

      // WEBPAY: requiere POST con token_ws
      const wpUrl = String(data?.webpay?.url || "");
      const wpToken = String(data?.webpay?.token || "");
      if (wpUrl && wpToken) {
        submitToWebpay(wpUrl, wpToken);
        return;
      }

      // Fallback general: checkoutUrl / redirectUrl / url / fintoc.url
      const checkoutUrl =
        String(data?.checkoutUrl || "") ||
        String(data?.redirectUrl || "") ||
        String(data?.url || "") ||
        String(data?.fintoc?.url || "") ||
        String(data?.redirect_url || "");

      if (!checkoutUrl) {
        throw new Error("No recibí una URL válida para continuar el pago.");
      }

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

        <div className="max-w-5xl mx-auto">
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
                Datos del comprador
              </h2>

              {err ? (
                <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-white/90 font-semibold">No se pudo iniciar el pago</p>
                  <p className="mt-1 text-sm text-white/70">{err}</p>
                </div>
              ) : null}

              <form onSubmit={handlePayment} className="space-y-5">
                {/* Método de pago */}
                <div className="rounded-2xl border border-purple-400/15 bg-black/20 p-4">
                  <p className="text-sm text-white/80 mb-3 font-semibold flex items-center gap-2">
                    <BadgeCheck className="w-4 h-4 text-purple-300" />
                    Método de pago
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("webpay")}
                      className={[
                        "rounded-xl border px-4 py-3 text-left transition-all",
                        paymentMethod === "webpay"
                          ? "border-purple-400/60 bg-purple-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-5 h-5 text-purple-300" />
                        <div>
                          <p className="text-white font-semibold">Webpay</p>
                          <p className="text-xs text-white/60">Tarjeta débito / crédito</p>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("fintoc")}
                      className={[
                        "rounded-xl border px-4 py-3 text-left transition-all",
                        paymentMethod === "fintoc"
                          ? "border-purple-400/60 bg-purple-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <Landmark className="w-5 h-5 text-purple-300" />
                        <div>
                          <p className="text-white font-semibold">Fintoc</p>
                          <p className="text-xs text-white/60">Transferencia bancaria</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Nombre */}
                <div>
                  <label htmlFor="name" className="block text-purple-200 font-medium mb-2">
                    Nombre completo
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60" />
                    <input
                      type="text"
                      id="name"
                      value={name}
                      onChange={(ev) => setName(ev.target.value)}
                      required
                      className={[
                        "w-full pl-12 pr-4 py-3 bg-black/30 border rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all",
                        validation.errors.name
                          ? "border-red-500/40"
                          : "border-purple-500/30 focus:border-purple-400",
                      ].join(" ")}
                      placeholder="Juan Pérez"
                    />
                  </div>
                  {validation.errors.name ? (
                    <p className="mt-1 text-xs text-red-300">{validation.errors.name}</p>
                  ) : null}
                </div>

                {/* RUT */}
                <div>
                  <label htmlFor="rut" className="block text-purple-200 font-medium mb-2">
                    RUT
                  </label>
                  <div className="relative">
                    <BadgeCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60" />
                    <input
                      type="text"
                      id="rut"
                      value={rut}
                      onChange={(ev) => setRut(ev.target.value)}
                      onBlur={() => setRut((x) => (x ? formatRut(x) : ""))}
                      required
                      className={[
                        "w-full pl-12 pr-4 py-3 bg-black/30 border rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all",
                        validation.errors.rut
                          ? "border-red-500/40"
                          : "border-purple-500/30 focus:border-purple-400",
                      ].join(" ")}
                      placeholder="12.345.678-5"
                    />
                  </div>
                  {validation.errors.rut ? (
                    <p className="mt-1 text-xs text-red-300">{validation.errors.rut}</p>
                  ) : null}
                </div>

                {/* Teléfono */}
                <div>
                  <label htmlFor="phone" className="block text-purple-200 font-medium mb-2">
                    Teléfono
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60" />
                    <input
                      type="tel"
                      id="phone"
                      value={phone}
                      onChange={(ev) => setPhone(ev.target.value)}
                      required
                      className={[
                        "w-full pl-12 pr-4 py-3 bg-black/30 border rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all",
                        validation.errors.phone
                          ? "border-red-500/40"
                          : "border-purple-500/30 focus:border-purple-400",
                      ].join(" ")}
                      placeholder="9 1234 5678"
                      inputMode="tel"
                    />
                  </div>
                  {validation.errors.phone ? (
                    <p className="mt-1 text-xs text-red-300">{validation.errors.phone}</p>
                  ) : null}
                </div>

                {/* Email */}
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
                      onChange={(ev) => setEmail(ev.target.value)}
                      required
                      className={[
                        "w-full pl-12 pr-4 py-3 bg-black/30 border rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all",
                        validation.errors.email
                          ? "border-red-500/40"
                          : "border-purple-500/30 focus:border-purple-400",
                      ].join(" ")}
                      placeholder="tu@email.com"
                    />
                  </div>

                  {emailSuggestion ? (
                    <button
                      type="button"
                      onClick={() => setEmail(emailSuggestion)}
                      className="mt-2 text-xs text-purple-200/90 hover:text-purple-200 underline"
                    >
                      ¿Quisiste decir <span className="font-semibold">{emailSuggestion}</span>?
                    </button>
                  ) : null}

                  {validation.errors.email ? (
                    <p className="mt-1 text-xs text-red-300">{validation.errors.email}</p>
                  ) : null}
                </div>

                {/* Confirm Email */}
                <div>
                  <label htmlFor="email2" className="block text-purple-200 font-medium mb-2">
                    Confirmar email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60" />
                    <input
                      type="email"
                      id="email2"
                      value={email2}
                      onChange={(ev) => setEmail2(ev.target.value)}
                      required
                      className={[
                        "w-full pl-12 pr-4 py-3 bg-black/30 border rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all",
                        validation.errors.email2
                          ? "border-red-500/40"
                          : "border-purple-500/30 focus:border-purple-400",
                      ].join(" ")}
                      placeholder="repite tu@email.com"
                    />
                  </div>
                  {validation.errors.email2 ? (
                    <p className="mt-1 text-xs text-red-300">{validation.errors.email2}</p>
                  ) : null}
                </div>

                {/* Región / Comuna */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-purple-200 font-medium mb-2">Región</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60" />
                      <select
                        value={regionCode}
                        onChange={(ev) => setRegionCode(ev.target.value)}
                        className={[
                          "w-full pl-12 pr-4 py-3 bg-black/30 border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all",
                          validation.errors.region
                            ? "border-red-500/40"
                            : "border-purple-500/30 focus:border-purple-400",
                        ].join(" ")}
                      >
                        <option value="">{loadingGeo ? "Cargando..." : "Selecciona región"}</option>
                        {regions.map((r) => (
                          <option key={r.codigo} value={r.codigo}>
                            {r.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    {validation.errors.region ? (
                      <p className="mt-1 text-xs text-red-300">{validation.errors.region}</p>
                    ) : null}
                  </div>

                  <div>
                    <label className="block text-purple-200 font-medium mb-2">Comuna</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400/60" />
                      <select
                        value={comunaCode}
                        onChange={(ev) => setComunaCode(ev.target.value)}
                        disabled={!regionCode || comunas.length === 0}
                        className={[
                          "w-full pl-12 pr-4 py-3 bg-black/30 border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all disabled:opacity-60",
                          validation.errors.comuna
                            ? "border-red-500/40"
                            : "border-purple-500/30 focus:border-purple-400",
                        ].join(" ")}
                      >
                        <option value="">
                          {!regionCode
                            ? "Elige región primero"
                            : loadingGeo
                            ? "Cargando..."
                            : "Selecciona comuna"}
                        </option>
                        {comunas.map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    {validation.errors.comuna ? (
                      <p className="mt-1 text-xs text-red-300">{validation.errors.comuna}</p>
                    ) : null}
                  </div>
                </div>

                {geoError ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                    <p className="text-xs text-white/80">
                      No pude cargar regiones/comunas automáticamente. ({geoError})
                    </p>
                    <p className="text-xs text-white/60 mt-1">
                      Tip: esto depende de red/CORS. Si te pasa en prod, lo mejor es proxy interno.
                    </p>
                  </div>
                ) : null}

                {/* Dirección */}
                <div>
                  <label htmlFor="address1" className="block text-purple-200 font-medium mb-2">
                    Dirección
                  </label>
                  <input
                    type="text"
                    id="address1"
                    value={address1}
                    onChange={(ev) => setAddress1(ev.target.value)}
                    required
                    className={[
                      "w-full px-4 py-3 bg-black/30 border rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-400/20 transition-all",
                      validation.errors.address1
                        ? "border-red-500/40"
                        : "border-purple-500/30 focus:border-purple-400",
                    ].join(" ")}
                    placeholder="Av. Siempre Viva 123, depto 45"
                  />
                  {validation.errors.address1 ? (
                    <p className="mt-1 text-xs text-red-300">{validation.errors.address1}</p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="address2" className="block text-purple-200 font-medium mb-2">
                    Referencia (opcional)
                  </label>
                  <input
                    type="text"
                    id="address2"
                    value={address2}
                    onChange={(ev) => setAddress2(ev.target.value)}
                    className="w-full px-4 py-3 bg-black/30 border border-purple-500/30 rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all"
                    placeholder="Torre B, portón negro, etc."
                  />
                </div>

                {/* Términos */}
                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(ev) => setAcceptTerms(ev.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm text-white/75">
                    Acepto términos y condiciones y autorizo el uso de mis datos para emitir y
                    enviar mis tickets.
                    {validation.errors.terms ? (
                      <span className="block mt-1 text-xs text-red-300">
                        {validation.errors.terms}
                      </span>
                    ) : null}
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold text-lg rounded-2xl shadow-lg shadow-purple-500/30 transition-all duration-300 transform hover:scale-[1.02] disabled:scale-100 flex items-center justify-center gap-3"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : paymentMethod === "webpay" ? (
                    <>
                      <CreditCard className="w-6 h-6" />
                      Pagar con Webpay
                    </>
                  ) : (
                    <>
                      <Landmark className="w-6 h-6" />
                      Pagar con Fintoc
                    </>
                  )}
                </button>

                <p className="text-[11px] text-white/45 leading-relaxed">
                  Nota honesta: ningún sistema puede “adivinar” si un correo existe sin enviar algo.
                  Aquí evitamos errores típicos y el server valida dominio/MX (si lo activas). Para
                  100% real: verificación por código (OTP).
                </p>
              </form>
            </div>

            {/* Resumen */}
            <div className="bg-gradient-to-br from-purple-900/40 to-violet-900/40 backdrop-blur-sm border border-purple-500/20 rounded-3xl p-8 shadow-2xl h-fit">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <ShoppingCart className="w-7 h-7 text-purple-300" />
                Resumen del pedido
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
