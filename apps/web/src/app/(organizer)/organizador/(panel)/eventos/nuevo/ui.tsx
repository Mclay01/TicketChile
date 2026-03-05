"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

/**
 * UI: Crear evento (carrusel + preview tipo /eventos)
 * - No depende de Tailwind config (usas Tailwind v4 via @import "tailwindcss")
 * - Mantiene compatibilidad con tu backend: manda `image` como string (URL/ruta)
 */

const glassCard = "rounded-2xl border border-white/10 bg-black/30 backdrop-blur";
const glassSoft = "rounded-xl border border-white/10 bg-black/20 backdrop-blur";
const input =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/20";
const textarea =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/20";
const label = "block text-sm text-white/70";
const helper = "mt-1 text-xs text-white/45";

type StepId = "basics" | "details" | "tickets" | "review";

type FormState = {
  title: string;
  city: string;
  venue: string;
  dateISO: string;
  image: string; // string (URL/ruta). Backend espera string en `image`.
  description: string;

  tt_name: string;
  tt_price: string;
  tt_capacity: string;
};

function toISOWithLocalOffset(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
}

function formatDateShort(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-CL", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function clp(n: number) {
  try {
    return n.toLocaleString("es-CL");
  } catch {
    return String(n);
  }
}

function pill(cls: string) {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs backdrop-blur ${cls}`;
}

function pickErr(errors: Record<string, string>, key: string) {
  return errors[key] ? (
    <div className="mt-1 text-xs text-red-200">{errors[key]}</div>
  ) : null;
}

function StepTab({
  active,
  done,
  label,
  onClick,
}: {
  active: boolean;
  done: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition backdrop-blur",
        active
          ? "border-white/20 bg-white/15 text-white"
          : done
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px]",
          active
            ? "border-white/20 bg-white/10 text-white"
            : done
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
            : "border-white/10 bg-white/5 text-white/50",
        ].join(" ")}
      >
        {done ? "✓" : "•"}
      </span>
      {label}
    </button>
  );
}

/**
 * Preview card estilo /eventos (similar a tu imagen):
 * - Poster arriba
 * - abajo info + "Desde" + botón "Comprar" rojo
 */
function EventPreviewCard({
  title,
  venue,
  city,
  dateISO,
  image,
  priceFrom,
}: {
  title: string;
  venue: string;
  city: string;
  dateISO: string;
  image: string;
  priceFrom: number | null;
}) {
  const t = title.trim() || "Título del evento";
  const v = venue.trim() || "Lugar";
  const c = city.trim() || "Ciudad";
  const dt = dateISO.trim();
  const when = dt ? formatDateShort(dt) : "Fecha (ISO)";
  const from = priceFrom !== null ? `$${clp(priceFrom)}` : "—";

  return (
    <div className="sticky top-6">
      <div
        className={[
          "overflow-hidden rounded-[28px] border border-white/10 bg-black/30 shadow-[0_30px_90px_rgba(0,0,0,.45)] backdrop-blur",
        ].join(" ")}
      >
        {/* Poster */}
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-white/5">
          {image ? (
            // usamos <img> para no depender de next/image domains
            <img
              src={image}
              alt="Poster"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-b from-white/10 to-transparent" />
          )}

          {/* chips arriba */}
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <span className={pill("border-white/10 bg-black/40 text-white/85")}>
              <span className="h-2 w-2 rounded-full bg-red-400" />
              {c.toUpperCase()}
            </span>

            <span className={pill("border-white/10 bg-black/40 text-white/85")}>
              {when.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-white">{t}</p>
            <p className="text-sm text-white/60">{v}</p>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-white/45">DESDE</p>
              <p className="text-3xl font-semibold text-white">{from}</p>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-3 rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(239,68,68,.25)] hover:bg-red-500/90"
            >
              Comprar
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                →
              </span>
            </button>
          </div>

          <p className="text-xs text-white/40">
            Preview: así se vería en <span className="text-white/60">/eventos</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NuevoEventoClient() {
  const formRef = useRef<HTMLFormElement | null>(null);

  const [step, setStep] = useState<StepId>("basics");
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);

  const [v, setV] = useState<FormState>({
    title: "",
    city: "",
    venue: "",
    dateISO: "",
    image: "",
    description: "",
    tt_name: "General",
    tt_price: "",
    tt_capacity: "",
  });

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const t = v.title.trim();
    const c = v.city.trim();
    const ven = v.venue.trim();
    const d = v.dateISO.trim();
    const desc = v.description.trim();

    const price = Number(v.tt_price);
    const cap = Number(v.tt_capacity);

    if (t.length < 3) e.title = "Pon un título con al menos 3 caracteres.";
    if (c.length < 2) e.city = "Ciudad requerida.";
    if (ven.length < 3) e.venue = "Lugar requerido.";

    if (!d) e.dateISO = "Fecha ISO requerida.";
    else {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime()))
        e.dateISO = "ISO inválido. Ej: 2026-04-22T17:00:00-03:00";
    }

    if (desc.length < 10) e.description = "Describe el evento (mínimo 10 caracteres).";

    if (!v.tt_name.trim()) e.tt_name = "Nombre del ticket requerido.";
    if (!v.tt_price.trim()) e.tt_price = "Precio requerido.";
    else if (!Number.isFinite(price) || price < 0) e.tt_price = "Precio inválido.";
    if (!v.tt_capacity.trim()) e.tt_capacity = "Capacidad requerida.";
    else if (!Number.isFinite(cap) || cap <= 0) e.tt_capacity = "Capacidad inválida.";

    // Imagen opcional, pero si viene debe ser URL/ruta razonable
    if (v.image.trim()) {
      // aceptamos /path o http(s)
      const ok = v.image.startsWith("/") || v.image.startsWith("http://") || v.image.startsWith("https://");
      if (!ok) e.image = "Usa una URL (https://...) o una ruta (/events/...).";
    }

    return e;
  }, [v]);

  const doneBasics = !errors.title && !errors.city && !errors.venue;
  const doneDetails = !errors.dateISO && !errors.description && !errors.image;
  const doneTickets = !errors.tt_name && !errors.tt_price && !errors.tt_capacity;

  const canSubmit = doneBasics && doneDetails && doneTickets && !busy;

  const priceFrom = v.tt_price.trim() ? Number(v.tt_price) : null;

  function goNext() {
    if (step === "basics") return setStep("details");
    if (step === "details") return setStep("tickets");
    if (step === "tickets") return setStep("review");
  }

  function goBack() {
    if (step === "review") return setStep("tickets");
    if (step === "tickets") return setStep("details");
    if (step === "details") return setStep("basics");
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setTopErr(null);

    if (!formRef.current) return;
    if (!canSubmit) {
      setTopErr("Revisa los campos antes de enviar.");
      setStep("review");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData(formRef.current);

      fd.set("title", v.title.trim());
      fd.set("city", v.city.trim());
      fd.set("venue", v.venue.trim());
      fd.set("dateISO", v.dateISO.trim());
      fd.set("image", v.image.trim());
      fd.set("description", v.description.trim());

      fd.set("tt_name", v.tt_name.trim());
      fd.set("tt_price", String(Number(v.tt_price)));
      fd.set("tt_capacity", String(Number(v.tt_capacity)));

      const r = await fetch("/api/organizador/eventos/submit", {
        method: "POST",
        body: fd,
        cache: "no-store",
        redirect: "manual",
      });

      if (r.status === 303 || r.status === 302 || r.status === 301) {
        const loc = r.headers.get("Location") || "/organizador";
        window.location.href = loc;
        return;
      }

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || `No se pudo enviar (${r.status}).`);
      }

      window.location.href = "/organizador";
    } catch (e: any) {
      setTopErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/organizador" className="text-sm text-white/60 hover:text-white">
            ← Volver al organizador
          </Link>

          <h1 className="text-3xl font-semibold tracking-tight text-white">Crear evento</h1>
          <p className="text-sm text-white/70">
            Completa el formulario por pasos. El preview (derecha) siempre se mantiene.
          </p>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StepTab active={step === "basics"} done={doneBasics} label="Básico" onClick={() => setStep("basics")} />
            <StepTab active={step === "details"} done={doneDetails} label="Detalles" onClick={() => setStep("details")} />
            <StepTab active={step === "tickets"} done={doneTickets} label="Tickets" onClick={() => setStep("tickets")} />
            <StepTab active={step === "review"} done={canSubmit} label="Revisión" onClick={() => setStep("review")} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setV((x) => ({ ...x, dateISO: x.dateISO || toISOWithLocalOffset(new Date()) }))}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
          >
            Generar ISO ahora
          </button>
        </div>
      </header>

      {topErr ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="font-semibold text-white">Error</p>
          <p className="mt-1 text-sm text-white/70">{topErr}</p>
        </div>
      ) : null}

      {/* Layout: left form + right sticky preview */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr] lg:items-start">
        {/* FORM */}
        <form ref={formRef} onSubmit={onSubmit} className={`${glassCard} p-6`}>
          {/* Carrusel */}
          <div
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20"
            aria-label="Carrusel pasos"
          >
            <div
              className="flex w-[400%] transition-transform duration-300 ease-out"
              style={{
                transform:
                  step === "basics"
                    ? "translateX(0%)"
                    : step === "details"
                    ? "translateX(-25%)"
                    : step === "tickets"
                    ? "translateX(-50%)"
                    : "translateX(-75%)",
              }}
            >
              {/* STEP 1 */}
              <section className="w-1/4 p-5">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-white/90">Básico</h2>
                  <p className="text-sm text-white/60">Nombre y ubicación del evento.</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className={label}>
                    Título
                    <input
                      name="title"
                      className={input}
                      value={v.title}
                      onChange={(e) => setV((x) => ({ ...x, title: e.target.value }))}
                      placeholder="Ej: Noche de Rock"
                      required
                    />
                    {pickErr(errors, "title")}
                  </label>

                  <label className={label}>
                    Ciudad
                    <input
                      name="city"
                      className={input}
                      value={v.city}
                      onChange={(e) => setV((x) => ({ ...x, city: e.target.value }))}
                      placeholder="Ej: Santiago"
                      required
                    />
                    {pickErr(errors, "city")}
                  </label>

                  <label className={`${label} md:col-span-2`}>
                    Lugar (venue)
                    <input
                      name="venue"
                      className={input}
                      value={v.venue}
                      onChange={(e) => setV((x) => ({ ...x, venue: e.target.value }))}
                      placeholder="Ej: Calle Cualquiera 123"
                      required
                    />
                    {pickErr(errors, "venue")}
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-white/45">Paso 1 de 4</span>
                  <button
                    type="button"
                    onClick={goNext}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-semibold",
                      doneBasics ? "bg-white text-black hover:bg-white/90" : "bg-white/15 text-white/40 cursor-not-allowed",
                    ].join(" ")}
                    disabled={!doneBasics}
                  >
                    Siguiente →
                  </button>
                </div>
              </section>

              {/* STEP 2 */}
              <section className="w-1/4 p-5">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-white/90">Detalles</h2>
                  <p className="text-sm text-white/60">Fecha, imagen y descripción.</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className={label}>
                    Fecha y hora (ISO)
                    <input
                      name="dateISO"
                      className={input}
                      value={v.dateISO}
                      onChange={(e) => setV((x) => ({ ...x, dateISO: e.target.value }))}
                      placeholder="2026-04-22T17:00:00-03:00"
                      required
                    />
                    <div className={helper}>
                      Preview:{" "}
                      <span className="text-white/70">
                        {v.dateISO.trim() ? formatDateShort(v.dateISO.trim()) : "—"}
                      </span>
                    </div>
                    {pickErr(errors, "dateISO")}
                  </label>

                  <label className={label}>
                    Imagen (URL / Ruta)
                    <input
                      name="image"
                      className={input}
                      value={v.image}
                      onChange={(e) => setV((x) => ({ ...x, image: e.target.value }))}
                      placeholder="https://... o /events/..."
                    />
                    <div className={helper}>
                      Tip: usa una imagen vertical (4:5) para que se vea como en /eventos.
                    </div>
                    {pickErr(errors, "image")}
                  </label>

                  <label className={`${label} md:col-span-2`}>
                    Descripción
                    <textarea
                      name="description"
                      rows={7}
                      className={textarea}
                      value={v.description}
                      onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))}
                      placeholder="Horarios, edades, accesos, etc."
                      required
                    />
                    {pickErr(errors, "description")}
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
                  >
                    ← Atrás
                  </button>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/45">Paso 2 de 4</span>
                    <button
                      type="button"
                      onClick={goNext}
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold",
                        doneDetails ? "bg-white text-black hover:bg-white/90" : "bg-white/15 text-white/40 cursor-not-allowed",
                      ].join(" ")}
                      disabled={!doneDetails}
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              </section>

              {/* STEP 3 */}
              <section className="w-1/4 p-5">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-white/90">Tickets</h2>
                  <p className="text-sm text-white/60">Define el ticket base (precio desde + capacidad).</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className={label}>
                    Nombre
                    <input
                      name="tt_name"
                      className={input}
                      value={v.tt_name}
                      onChange={(e) => setV((x) => ({ ...x, tt_name: e.target.value }))}
                      required
                    />
                    {pickErr(errors, "tt_name")}
                  </label>

                  <label className={label}>
                    Precio (CLP)
                    <input
                      name="tt_price"
                      type="number"
                      min={0}
                      className={input}
                      value={v.tt_price}
                      onChange={(e) => setV((x) => ({ ...x, tt_price: e.target.value }))}
                      placeholder="12000"
                      required
                    />
                    <div className={helper}>
                      Preview:{" "}
                      <span className="text-white/70">
                        {v.tt_price.trim() ? `$${clp(Number(v.tt_price))}` : "—"}
                      </span>
                    </div>
                    {pickErr(errors, "tt_price")}
                  </label>

                  <label className={label}>
                    Capacidad
                    <input
                      name="tt_capacity"
                      type="number"
                      min={1}
                      className={input}
                      value={v.tt_capacity}
                      onChange={(e) => setV((x) => ({ ...x, tt_capacity: e.target.value }))}
                      placeholder="500"
                      required
                    />
                    {pickErr(errors, "tt_capacity")}
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
                  >
                    ← Atrás
                  </button>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/45">Paso 3 de 4</span>
                    <button
                      type="button"
                      onClick={goNext}
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold",
                        doneTickets ? "bg-white text-black hover:bg-white/90" : "bg-white/15 text-white/40 cursor-not-allowed",
                      ].join(" ")}
                      disabled={!doneTickets}
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              </section>

              {/* STEP 4 */}
              <section className="w-1/4 p-5">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-white/90">Revisión</h2>
                  <p className="text-sm text-white/60">
                    Si el preview se ve bien, envía. Si no, vuelve y corrige (sin drama).
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Título</p>
                    <p className="mt-1 text-sm text-white/90">{v.title.trim() || "—"}</p>
                    {pickErr(errors, "title")}
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Ciudad</p>
                    <p className="mt-1 text-sm text-white/90">{v.city.trim() || "—"}</p>
                    {pickErr(errors, "city")}
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Lugar</p>
                    <p className="mt-1 text-sm text-white/90">{v.venue.trim() || "—"}</p>
                    {pickErr(errors, "venue")}
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Fecha ISO</p>
                    <p className="mt-1 text-sm text-white/90 break-all">{v.dateISO.trim() || "—"}</p>
                    {pickErr(errors, "dateISO")}
                  </div>

                  <div className={`${glassSoft} p-4 md:col-span-2`}>
                    <p className="text-xs text-white/50">Descripción</p>
                    <p className="mt-1 text-sm text-white/80 whitespace-pre-wrap">{v.description.trim() || "—"}</p>
                    {pickErr(errors, "description")}
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Ticket</p>
                    <p className="mt-1 text-sm text-white/90">
                      {v.tt_name.trim() || "—"} • ${v.tt_price.trim() ? clp(Number(v.tt_price)) : "—"} • cap{" "}
                      {v.tt_capacity.trim() ? clp(Number(v.tt_capacity)) : "—"}
                    </p>
                    {pickErr(errors, "tt_name")}
                    {pickErr(errors, "tt_price")}
                    {pickErr(errors, "tt_capacity")}
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Imagen</p>
                    <p className="mt-1 text-sm text-white/90 break-all">{v.image.trim() || "—"}</p>
                    {pickErr(errors, "image")}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
                  >
                    ← Atrás
                  </button>

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={[
                      "rounded-xl px-5 py-2.5 text-sm font-semibold",
                      canSubmit
                        ? "bg-white text-black hover:bg-white/90"
                        : "bg-white/15 text-white/40 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {busy ? "Enviando…" : "Enviar a revisión"}
                  </button>
                </div>

                <div className="mt-3 text-xs text-white/45">
                  <Link href="/organizador" className="hover:text-white">
                    ← volver al panel
                  </Link>
                </div>
              </section>
            </div>
          </div>

          {/* Mini nav móvil */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white/45">
              {step === "basics"
                ? "Básico"
                : step === "details"
                ? "Detalles"
                : step === "tickets"
                ? "Tickets"
                : "Revisión"}{" "}
              •{" "}
              {step === "basics"
                ? "1/4"
                : step === "details"
                ? "2/4"
                : step === "tickets"
                ? "3/4"
                : "4/4"}
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10 disabled:opacity-40"
                disabled={step === "basics"}
              >
                Atrás
              </button>

              <button
                type="button"
                onClick={goNext}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-40"
                disabled={step === "review" || (step === "basics" ? !doneBasics : step === "details" ? !doneDetails : !doneTickets)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </form>

        {/* PREVIEW */}
        <div className="space-y-3">
          <div className={`${glassCard} p-4`}>
            <p className="text-sm font-semibold text-white/90">Vista previa</p>
            <p className="mt-1 text-xs text-white/55">
              Se mantiene visible y replica la tarjeta de <span className="text-white/70">/eventos</span>.
            </p>

            <div className="mt-4">
              <EventPreviewCard
                title={v.title}
                venue={v.venue}
                city={v.city}
                dateISO={v.dateISO}
                image={v.image}
                priceFrom={priceFrom}
              />
            </div>
          </div>

          {/* Helper pro */}
          <div className={`${glassSoft} p-4`}>
            <p className="text-xs text-white/60">
              Recomendación: usa imagen <span className="text-white/80">4:5</span> (vertical) para que se vea como
              la tarjeta del ejemplo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}