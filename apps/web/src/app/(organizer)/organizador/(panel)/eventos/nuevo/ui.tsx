"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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

  eventDate: string; // yyyy-mm-dd
  eventTime: string; // hh:mm
  dateISO: string;   // generado automáticamente

  image: string; // base64 data url para compatibilidad con backend actual
  description: string;

  tt_name: string;
  tt_price: string;
  tt_capacity: string;
};

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
  return errors[key] ? <div className="mt-1 text-xs text-red-200">{errors[key]}</div> : null;
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
  const when = dt ? formatDateShort(dt) : "Fecha";
  const from = priceFrom !== null ? `$${clp(priceFrom)}` : "—";

  return (
    <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[26px] border border-white/10 bg-black/30 shadow-[0_24px_70px_rgba(0,0,0,.40)] backdrop-blur">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-white/5">
        {image ? (
          <img src={image} alt="Poster" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-gradient-to-b from-white/10 to-transparent" />
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className={pill("border-white/10 bg-black/40 text-white/85")}>
            <span className="h-2 w-2 rounded-full bg-red-400" />
            {c.toUpperCase()}
          </span>

          <span className={pill("border-white/10 bg-black/40 text-white/85")}>
            {when.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-white">{t}</p>
          <p className="text-sm text-white/60">{v}</p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-white/45">DESDE</p>
            <p className="text-2xl font-semibold text-white">{from}</p>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-3 rounded-full bg-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(239,68,68,.25)] hover:bg-red-500/90"
          >
            Comprar
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
              →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function buildISOFromLocal(date: string, time: string) {
  if (!date || !time) return "";

  const [yyyy, mm, dd] = date.split("-").map(Number);
  const [hh, mi] = time.split(":").map(Number);

  if (!yyyy || !mm || !dd || hh === undefined || mi === undefined) return "";

  const d = new Date(yyyy, mm - 1, dd, hh, mi, 0);
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:00${sign}${offH}:${offM}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

export default function NuevoEventoClient() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<StepId>("basics");
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [v, setV] = useState<FormState>({
    title: "",
    city: "",
    venue: "",
    eventDate: "",
    eventTime: "",
    dateISO: "",
    image: "",
    description: "",
    tt_name: "General",
    tt_price: "",
    tt_capacity: "",
  });

  useEffect(() => {
    const iso = buildISOFromLocal(v.eventDate, v.eventTime);
    setV((prev) => (prev.dateISO === iso ? prev : { ...prev, dateISO: iso }));
  }, [v.eventDate, v.eventTime]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const t = v.title.trim();
    const c = v.city.trim();
    const ven = v.venue.trim();
    const desc = v.description.trim();

    const price = Number(v.tt_price);
    const cap = Number(v.tt_capacity);

    if (t.length < 3) e.title = "Pon un título con al menos 3 caracteres.";
    if (c.length < 2) e.city = "Ciudad requerida.";
    if (ven.length < 3) e.venue = "Lugar requerido.";

    if (!v.eventDate) e.eventDate = "Selecciona una fecha.";
    if (!v.eventTime) e.eventTime = "Selecciona una hora.";
    if (!v.dateISO) e.dateISO = "No se pudo generar la fecha ISO.";

    if (desc.length < 10) e.description = "Describe el evento (mínimo 10 caracteres).";

    if (!v.tt_name.trim()) e.tt_name = "Nombre del ticket requerido.";
    if (!v.tt_price.trim()) e.tt_price = "Precio requerido.";
    else if (!Number.isFinite(price) || price < 0) e.tt_price = "Precio inválido.";
    if (!v.tt_capacity.trim()) e.tt_capacity = "Capacidad requerida.";
    else if (!Number.isFinite(cap) || cap <= 0) e.tt_capacity = "Capacidad inválida.";

    // Imagen opcional, pero si existe validamos que sea data url
    if (v.image.trim() && !v.image.startsWith("data:image/")) {
      e.image = "La imagen no es válida.";
    }

    return e;
  }, [v]);

  const doneBasics = !errors.title && !errors.city && !errors.venue;
  const doneDetails =
    !errors.eventDate && !errors.eventTime && !errors.dateISO && !errors.description && !errors.image;
  const doneTickets = !errors.tt_name && !errors.tt_price && !errors.tt_capacity;

  const canSubmit = doneBasics && doneDetails && doneTickets && !busy && !imgBusy;
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

  async function handleFile(file: File | null) {
    if (!file) return;

    setTopErr(null);

    const validType = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!validType) {
      setTopErr("Formato no soportado. Usa JPG, PNG o WEBP.");
      return;
    }

    // ⚠️ Esto funciona con tu backend actual porque espera string.
    // Guardamos base64. No es lo ideal para producción masiva, pero te deja operando ya.
    // Máx razonable 1.5MB para no mandar un misil nuclear en base64.
    if (file.size > 1.5 * 1024 * 1024) {
      setTopErr("La imagen es muy pesada. Usa una de máximo 1.5MB.");
      return;
    }

    setImgBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setV((x) => ({ ...x, image: dataUrl }));
    } catch {
      setTopErr("No se pudo leer la imagen.");
    } finally {
      setImgBusy(false);
    }
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
      if (!r.ok || !j?.ok) throw new Error(j?.error || `No se pudo enviar (${r.status}).`);

      window.location.href = "/organizador";
    } catch (e: any) {
      setTopErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/organizador" className="text-sm text-white/60 hover:text-white">
            ← Volver al organizador
          </Link>

          <h1 className="text-3xl font-semibold tracking-tight text-white">Crear evento</h1>
          <p className="text-sm text-white/70">
            Formulario por pasos con vista previa dinámica.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StepTab active={step === "basics"} done={doneBasics} label="Básico" onClick={() => setStep("basics")} />
            <StepTab active={step === "details"} done={doneDetails} label="Detalles" onClick={() => setStep("details")} />
            <StepTab active={step === "tickets"} done={doneTickets} label="Tickets" onClick={() => setStep("tickets")} />
            <StepTab active={step === "review"} done={canSubmit} label="Revisión" onClick={() => setStep("review")} />
          </div>
        </div>
      </header>

      {topErr ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="font-semibold text-white">Error</p>
          <p className="mt-1 text-sm text-white/70">{topErr}</p>
        </div>
      ) : null}

      {/* ✅ Mobile: formulario primero, preview debajo
          ✅ Desktop: form izquierda, preview derecha
      */}
      <div className="grid gap-6 lg:grid-cols-[1.08fr_.92fr] lg:items-start">
        {/* FORMULARIO */}
        <form ref={formRef} onSubmit={onSubmit} className={`${glassCard} p-6`}>
          {/* hidden real para backend */}
          <input type="hidden" name="image" value={v.image} />

          {/* carrusel sin tarjeta interior */}
          <div className="relative overflow-hidden rounded-2xl">
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
              <section className="w-1/4">
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
              </section>

              {/* STEP 2 */}
              <section className="w-1/4">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-white/90">Detalles</h2>
                  <p className="text-sm text-white/60">Fecha, hora, imagen y descripción.</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className={label}>
                    Fecha
                    <input
                      type="date"
                      className={input}
                      value={v.eventDate}
                      onChange={(e) => setV((x) => ({ ...x, eventDate: e.target.value }))}
                      required
                    />
                    {pickErr(errors, "eventDate")}
                  </label>

                  <label className={label}>
                    Hora
                    <input
                      type="time"
                      className={input}
                      value={v.eventTime}
                      onChange={(e) => setV((x) => ({ ...x, eventTime: e.target.value }))}
                      required
                    />
                    {pickErr(errors, "eventTime")}
                  </label>

                  <div className="md:col-span-2">
                    <p className={label}>Imagen</p>

                    <div
                      className={[
                        "mt-2 rounded-2xl border border-dashed px-4 py-6 text-center transition",
                        dragging
                          ? "border-white/30 bg-white/10"
                          : "border-white/10 bg-black/20",
                      ].join(" ")}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setDragging(false);
                        const file = e.dataTransfer.files?.[0] || null;
                        await handleFile(file);
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0] || null;
                          await handleFile(file);
                        }}
                      />

                      <p className="text-sm font-medium text-white/90">
                        Arrastra una imagen aquí
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        o selecciónala desde tus archivos
                      </p>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                      >
                        {imgBusy ? "Cargando..." : "Elegir imagen"}
                      </button>

                      {v.image ? (
                        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-2">
                          <img
                            src={v.image}
                            alt="Preview"
                            className="mx-auto max-h-44 rounded-lg object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setV((x) => ({ ...x, image: "" }))}
                            className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                          >
                            Quitar imagen
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className={helper}>
                      JPG, PNG o WEBP. Máximo 1.5MB.
                    </div>
                    {pickErr(errors, "image")}
                  </div>

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
              </section>

              {/* STEP 3 */}
              <section className="w-1/4">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-white/90">Tickets</h2>
                  <p className="text-sm text-white/60">Define ticket base (desde + capacidad).</p>
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
              </section>

              {/* STEP 4 */}
              <section className="w-1/4">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-white/90">Revisión</h2>
                  <p className="text-sm text-white/60">Si el preview se ve bien, envía.</p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Título</p>
                    <p className="mt-1 text-sm text-white/90">{v.title.trim() || "—"}</p>
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Ciudad</p>
                    <p className="mt-1 text-sm text-white/90">{v.city.trim() || "—"}</p>
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Lugar</p>
                    <p className="mt-1 text-sm text-white/90">{v.venue.trim() || "—"}</p>
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Fecha y hora</p>
                    <p className="mt-1 text-sm text-white/90">
                      {v.dateISO.trim() ? formatDateShort(v.dateISO.trim()) : "—"}
                    </p>
                  </div>

                  <div className={`${glassSoft} p-4 md:col-span-2`}>
                    <p className="text-xs text-white/50">Descripción</p>
                    <p className="mt-1 text-sm text-white/80 whitespace-pre-wrap">{v.description.trim() || "—"}</p>
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Ticket</p>
                    <p className="mt-1 text-sm text-white/90">
                      {v.tt_name.trim() || "—"} • ${v.tt_price.trim() ? clp(Number(v.tt_price)) : "—"} • cap{" "}
                      {v.tt_capacity.trim() ? clp(Number(v.tt_capacity)) : "—"}
                    </p>
                  </div>

                  <div className={`${glassSoft} p-4`}>
                    <p className="text-xs text-white/50">Imagen</p>
                    <p className="mt-1 text-sm text-white/90">{v.image ? "Cargada" : "Sin imagen"}</p>
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

          {/* navegación */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white/45">
              {step === "basics" ? "1/4" : step === "details" ? "2/4" : step === "tickets" ? "3/4" : "4/4"}
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
                disabled={
                  step === "review" ||
                  (step === "basics" ? !doneBasics : step === "details" ? !doneDetails : !doneTickets)
                }
              >
                Siguiente
              </button>
            </div>
          </div>
        </form>

        {/* PREVIEW ABAJO EN MÓVIL / DERECHA EN DESKTOP */}
        <div className="space-y-3">
          <div className={`${glassCard} p-4`}>
            <p className="text-sm font-semibold text-white/90">Vista previa</p>
            <p className="mt-1 text-xs text-white/55">
              Replica la tarjeta de <span className="text-white/70">/eventos</span>.
            </p>

            <div className="mt-4 lg:sticky lg:top-6">
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
        </div>
      </div>
    </div>
  );
}