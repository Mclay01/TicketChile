"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

const card = "rounded-xl border border-black/10 bg-white shadow-sm";
const subCard = "rounded-xl border border-black/10 bg-white/70 shadow-sm";
const label = "block text-sm text-black/70";
const input =
  "mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black outline-none placeholder:text-black/40 focus:border-black/25";
const textarea =
  "mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black outline-none placeholder:text-black/40 focus:border-black/25";
const helper = "mt-1 text-xs text-black/45";

function pickErr(errors: Record<string, string>, key: string) {
  return errors[key] ? <div className="mt-1 text-xs text-red-600">{errors[key]}</div> : null;
}

function formatDateLong(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-CL", {
      weekday: "short",
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Genera ISO con offset local real (ej: -03:00)
 * Ej: 2026-04-22T17:00:00-03:00
 */
function toISOWithLocalOffset(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  const offMin = -d.getTimezoneOffset(); // minutos con signo (Chile suele dar -180)
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
}

function clp(n: number) {
  try {
    return n.toLocaleString("es-CL");
  } catch {
    return String(n);
  }
}

type FormState = {
  title: string;
  city: string;
  venue: string;
  dateISO: string;
  image: string;
  description: string;

  tt_name: string;
  tt_price: string;
  tt_capacity: string;
};

export default function NuevoEventoClient() {
  const formRef = useRef<HTMLFormElement | null>(null);

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

  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);

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
      if (Number.isNaN(dt.getTime())) e.dateISO = "Formato ISO inválido. Ej: 2026-04-22T17:00:00-03:00";
    }
    if (desc.length < 10) e.description = "Describe el evento (mínimo 10 caracteres).";

    if (!v.tt_name.trim()) e.tt_name = "Nombre del ticket requerido.";
    if (!v.tt_price.trim()) e.tt_price = "Precio requerido.";
    else if (!Number.isFinite(price) || price < 0) e.tt_price = "Precio inválido.";
    if (!v.tt_capacity.trim()) e.tt_capacity = "Capacidad requerida.";
    else if (!Number.isFinite(cap) || cap <= 0) e.tt_capacity = "Capacidad inválida.";

    return e;
  }, [v]);

  const canSubmit = Object.keys(errors).length === 0 && !busy;

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setTopErr(null);

    if (!formRef.current) return;
    if (!canSubmit) {
      setTopErr("Revisa los campos marcados antes de enviar.");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData(formRef.current);

      // (Opcional) normalización pro: trim en server ya lo haces, pero aquí dejamos limpio
      fd.set("title", v.title.trim());
      fd.set("city", v.city.trim());
      fd.set("venue", v.venue.trim());
      fd.set("dateISO", v.dateISO.trim());
      fd.set("image", v.image.trim());
      fd.set("description", v.description.trim());

      fd.set("tt_name", v.tt_name.trim());
      fd.set("tt_price", String(Number(v.tt_price)));
      fd.set("tt_capacity", String(Number(v.tt_capacity)));

      // Importante: capturar 303 y redirigir nosotros (UX)
      const r = await fetch("/api/organizador/eventos/submit", {
        method: "POST",
        body: fd,
        cache: "no-store",
        redirect: "manual",
      });

      // Si es redirect (303/302) => navegar
      if (r.status === 303 || r.status === 302 || r.status === 301) {
        const loc = r.headers.get("Location") || "/organizador";
        window.location.href = loc;
        return;
      }

      // Si el browser entrega opaque redirect, igual mandamos al panel
      if ((r as any).type === "opaqueredirect") {
        window.location.href = "/organizador";
        return;
      }

      // Errores JSON del endpoint
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || `No se pudo enviar (${r.status}).`);
      }

      // Si por alguna razón devuelve ok sin redirect
      window.location.href = "/organizador";
    } catch (e: any) {
      setTopErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const previewPrice = Number(v.tt_price);
  const previewCap = Number(v.tt_capacity);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Crear evento</h1>
        <p className="text-sm text-white/70">
          Al enviar, el evento queda <span className="text-white">en revisión</span>.
        </p>
      </div>

      {/* Error superior */}
      {topErr ? (
        <div className="rounded-xl border border-red-600/20 bg-red-600/10 px-4 py-3 text-sm text-red-100">
          {topErr}
        </div>
      ) : null}

      {/* Form */}
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className={`${card} p-6 space-y-6`}
      >
        {/* Datos */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-black/80">Datos del evento</h2>
            <button
              type="button"
              onClick={() => setV((x) => ({ ...x, dateISO: x.dateISO || toISOWithLocalOffset(new Date()) }))}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-black/5"
            >
              Generar ISO ahora
            </button>
          </div>
          <p className="text-xs text-black/45">
            Tip: usa ISO con offset Chile (ej: <span className="font-mono">-03:00</span>).
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>
            Título
            <input
              name="title"
              className={input}
              value={v.title}
              onChange={(e) => setV((x) => ({ ...x, title: e.target.value }))}
              placeholder="Ej: Festival Rock en el Parque"
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
              placeholder="Ej: Teatro Caupolicán"
              required
            />
            {pickErr(errors, "venue")}
          </label>

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
              <span className="text-black/70">
                {v.dateISO.trim() ? formatDateLong(v.dateISO.trim()) : "—"}
              </span>
            </div>
            {pickErr(errors, "dateISO")}
          </label>

          <label className={label}>
            Imagen (opcional)
            <input
              name="image"
              className={input}
              value={v.image}
              onChange={(e) => setV((x) => ({ ...x, image: e.target.value }))}
              placeholder="/events/mi-evento.jpg"
            />
            <div className={helper}>Puede ser ruta interna o URL (si tu sistema lo soporta).</div>
          </label>

          <label className={`${label} md:col-span-2`}>
            Descripción
            <textarea
              name="description"
              rows={6}
              className={textarea}
              value={v.description}
              onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))}
              placeholder="Cuenta lo esencial: horario, edades, accesos, etc."
              required
            />
            {pickErr(errors, "description")}
          </label>
        </div>

        {/* Ticket base */}
        <div className={`${subCard} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-black/80">Ticket base</p>
            <p className="text-xs text-black/45">
              “Desde” se calcula con este ticket.
            </p>
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
                <span className="text-black/70">
                  {Number.isFinite(previewPrice) && v.tt_price !== "" ? `$${clp(previewPrice)}` : "—"}
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
              <div className={helper}>
                Preview:{" "}
                <span className="text-black/70">
                  {Number.isFinite(previewCap) && v.tt_capacity !== "" ? `${clp(previewCap)} entradas` : "—"}
                </span>
              </div>
              {pickErr(errors, "tt_capacity")}
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            "w-full rounded-lg px-4 py-2.5 text-sm font-semibold",
            canSubmit ? "bg-black text-white hover:bg-black/90" : "bg-black/30 text-white/70 cursor-not-allowed",
          ].join(" ")}
        >
          {busy ? "Enviando…" : "Enviar a revisión"}
        </button>

        <div className="text-xs text-black/50">
          <Link href="/organizador" className="hover:text-black">
            ← volver al panel
          </Link>
        </div>
      </form>

      {/* Preview (opción B: abajo) */}
      <div className={`${card} p-6`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-black/80">Vista previa</h3>
            <p className="text-xs text-black/45">Así se verá “en esencia” en tu panel.</p>
          </div>
          <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/60">
            Draft
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-lg font-semibold text-black">
              {v.title.trim() ? v.title.trim() : "Título del evento"}
            </p>
            <p className="text-sm text-black/60">
              {(v.city.trim() ? v.city.trim() : "Ciudad")}{v.venue.trim() ? ` • ${v.venue.trim()}` : ""}{" "}
              {v.dateISO.trim() ? ` • ${formatDateLong(v.dateISO.trim())}` : ""}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-black/10 bg-white p-3">
              <p className="text-xs text-black/45">Ticket base</p>
              <p className="mt-1 text-sm font-semibold text-black">
                {v.tt_name.trim() ? v.tt_name.trim() : "General"}
              </p>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-3">
              <p className="text-xs text-black/45">Desde</p>
              <p className="mt-1 text-sm font-semibold text-black">
                {Number.isFinite(previewPrice) && v.tt_price !== "" ? `$${clp(previewPrice)}` : "—"}
              </p>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-3">
              <p className="text-xs text-black/45">Capacidad</p>
              <p className="mt-1 text-sm font-semibold text-black">
                {Number.isFinite(previewCap) && v.tt_capacity !== "" ? clp(previewCap) : "—"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-white p-3">
            <p className="text-xs text-black/45">Descripción</p>
            <p className="mt-1 text-sm text-black/70 whitespace-pre-wrap">
              {v.description.trim() ? v.description.trim() : "Descripción del evento…"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}