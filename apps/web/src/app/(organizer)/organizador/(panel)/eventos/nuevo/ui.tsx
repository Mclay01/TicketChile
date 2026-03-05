"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";

const glassCard =
  "rounded-2xl border border-white/10 bg-black/30 backdrop-blur";
const glassSoft =
  "rounded-xl border border-white/10 bg-black/20 backdrop-blur";
const input =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/20";
const textarea =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/20";
const label = "block text-sm text-white/70";
const helper = "mt-1 text-xs text-white/45";

type FormState = {
  title: string;
  city: string;
  venue: string;
  dateISO: string;
  imageUrl: string; // lo que termina en el payload (string)
  description: string;

  tt_name: string;
  tt_price: string;
  tt_capacity: string;
};

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

function clp(n: number) {
  try {
    return n.toLocaleString("es-CL");
  } catch {
    return String(n);
  }
}

function pickErr(errors: Record<string, string>, key: string) {
  return errors[key] ? (
    <div className="mt-1 text-xs text-red-200">{errors[key]}</div>
  ) : null;
}

async function uploadImageIfAvailable(file: File): Promise<string | null> {
  // ✅ Camino B: endpoint de upload (cuando lo tengas)
  // Esperado: { ok: true, url: "https://..." }
  // Si no existe o falla, devolvemos null y usamos fallback.
  try {
    const fd = new FormData();
    fd.set("file", file);

    const r = await fetch("/api/upload", {
      method: "POST",
      body: fd,
      cache: "no-store",
    });

    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok || !j?.url) return null;
    return String(j.url);
  } catch {
    return null;
  }
}

export default function NuevoEventoClient() {
  const formRef = useRef<HTMLFormElement | null>(null);

  const [v, setV] = useState<FormState>({
    title: "",
    city: "",
    venue: "",
    dateISO: "",
    imageUrl: "",
    description: "",
    tt_name: "General",
    tt_price: "",
    tt_capacity: "",
  });

  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);

  // Imagen moderna
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [imgBusy, setImgBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

    // Imagen: no es requerida, pero si hay file, validamos tipo/peso.
    if (file) {
      const okType = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
      if (!okType) e.imageUrl = "Formato no soportado. Usa PNG/JPG/WEBP.";
      const max = 4 * 1024 * 1024; // 4MB
      if (file.size > max) e.imageUrl = "La imagen pesa mucho (máx 4MB).";
    }

    return e;
  }, [v, file]);

  const canSubmit = Object.keys(errors).length === 0 && !busy && !imgBusy;

  const previewPrice = Number(v.tt_price);
  const previewCap = Number(v.tt_capacity);

  function setFileSafe(f: File | null) {
    // liberar preview anterior
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {}
    }
    setPreviewUrl(f ? URL.createObjectURL(f) : "");
    setFile(f);
  }

  async function handlePickFile(f: File) {
    setTopErr(null);
    setImgBusy(true);
    try {
      setFileSafe(f);

      // Camino B: intentar upload => guardar URL string en imageUrl
      const url = await uploadImageIfAvailable(f);
      if (url) {
        setV((x) => ({ ...x, imageUrl: url }));
      } else {
        // Fallback (Camino A): si no hay uploader, dejamos imageUrl vacío
        // y el usuario puede pegar URL/ruta manual.
        setV((x) => ({ ...x, imageUrl: x.imageUrl || "" }));
      }
    } finally {
      setImgBusy(false);
    }
  }

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

      fd.set("title", v.title.trim());
      fd.set("city", v.city.trim());
      fd.set("venue", v.venue.trim());
      fd.set("dateISO", v.dateISO.trim());
      fd.set("description", v.description.trim());

      // ✅ IMPORTANTÍSIMO: tu backend espera string en "image"
      // Si tenemos uploader (imageUrl), mandamos eso.
      // Si no, mandamos lo que haya escrito el usuario (ruta/URL).
      fd.set("image", (v.imageUrl || "").trim());

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
      if ((r as any).type === "opaqueredirect") {
        window.location.href = "/organizador";
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

  const previewTitle = v.title.trim() || "Título del evento";
  const previewCity = v.city.trim() || "Ciudad";
  const previewVenue = v.venue.trim();
  const previewDate = v.dateISO.trim();
  const previewDesc = v.description.trim() || "Descripción del evento…";

  const finalImage = v.imageUrl.trim() || previewUrl || "";

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
            Envía tu evento y quedará <span className="text-white">en revisión</span>.
          </p>
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

      {/* Form */}
      <form ref={formRef} onSubmit={onSubmit} className={`${glassCard} p-6 space-y-6`}>
        {/* Datos */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white/90">Datos del evento</h2>
            <p className="mt-1 text-sm text-white/60">
              Completa lo esencial. El preview abajo se actualiza en tiempo real.
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
                <span className="text-white/70">
                  {previewDate ? formatDateLong(previewDate) : "—"}
                </span>
              </div>
              {pickErr(errors, "dateISO")}
            </label>

            {/* Imagen moderna */}
            <div className="md:col-span-1">
              <p className={label}>Imagen (opcional)</p>

              <div
                className={[
                  "mt-2 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur",
                  "transition hover:bg-white/5",
                ].join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const f = e.dataTransfer.files?.[0];
                  if (f) await handlePickFile(f);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white/90">Sube una imagen</p>
                    <p className="mt-1 text-xs text-white/50">
                      Arrastra y suelta (PNG/JPG/WEBP, máx 4MB) o selecciónala.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                  >
                    {imgBusy ? "Procesando…" : "Elegir"}
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] || null;
                      if (f) await handlePickFile(f);
                    }}
                  />
                </div>

                {pickErr(errors, "imageUrl")}

                {/* Preview */}
                {finalImage ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    {/* Si es URL externa, Image puede requerir config de domains; si falla, usar <img> */}
                    {/* Para no depender de config ahora, usamos <img> */}
                    <img
                      src={finalImage}
                      alt="Preview"
                      className="h-40 w-full object-cover"
                      loading="lazy"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <p className="text-xs text-white/60 break-all">
                        {v.imageUrl ? "URL guardada" : "Preview local"}:{" "}
                        <span className="text-white/80">{v.imageUrl || "archivo"}</span>
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setFileSafe(null);
                          setV((x) => ({ ...x, imageUrl: "" }));
                        }}
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs backdrop-blur hover:bg-white/10"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/50">
                    Si aún no tienes uploader, puedes pegar una URL/ruta aquí abajo (opcional).
                  </div>
                )}
              </div>

              {/* Fallback URL (mantiene compatibilidad con tu backend) */}
              <label className="mt-3 block text-xs text-white/60">
                URL / Ruta (fallback)
                <input
                  name="image"
                  className={input}
                  value={v.imageUrl}
                  onChange={(e) => setV((x) => ({ ...x, imageUrl: e.target.value }))}
                  placeholder="https://... o /events/mi-evento.jpg"
                />
              </label>
            </div>

            <label className={`${label} md:col-span-2`}>
              Descripción
              <textarea
                name="description"
                rows={6}
                className={textarea}
                value={v.description}
                onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))}
                placeholder="Horario, edades, accesos, etc."
                required
              />
              {pickErr(errors, "description")}
            </label>
          </div>
        </section>

        {/* Ticket base */}
        <section className={`${glassSoft} p-5`}>
          <div>
            <p className="text-sm font-semibold text-white/90">Ticket base</p>
            <p className="mt-1 text-xs text-white/50">Define precio “Desde” y capacidad inicial.</p>
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
                <span className="text-white/70">
                  {Number.isFinite(previewCap) && v.tt_capacity !== "" ? `${clp(previewCap)} entradas` : "—"}
                </span>
              </div>
              {pickErr(errors, "tt_capacity")}
            </label>
          </div>
        </section>

        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            "w-full rounded-xl px-4 py-3 text-sm font-semibold",
            canSubmit ? "bg-white text-black hover:bg-white/90" : "bg-white/20 text-white/50 cursor-not-allowed",
          ].join(" ")}
        >
          {busy ? "Enviando…" : "Enviar a revisión"}
        </button>

        <div className="text-xs text-white/50">
          <Link href="/organizador" className="hover:text-white">
            ← volver al panel
          </Link>
        </div>
      </form>

      {/* Preview panel-style */}
      <section className={`${glassCard} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white/90">Vista previa</h3>
            <p className="mt-1 text-sm text-white/60">Se ve como tarjeta real del panel.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/60 backdrop-blur">
            Draft
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          {finalImage ? (
            <img
              src={finalImage}
              alt="Imagen evento"
              className="h-44 w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-44 w-full bg-gradient-to-r from-white/5 to-white/0" />
          )}

          <div className="p-5">
            <p className="text-xs text-white/50">
              {previewCity}
              {previewVenue ? ` • ${previewVenue}` : ""}{" "}
              {previewDate ? ` • ${formatDateLong(previewDate)}` : ""}
            </p>

            <p className="mt-2 text-xl font-semibold text-white">{previewTitle}</p>

            <p className="mt-2 text-sm text-white/70 whitespace-pre-wrap">{previewDesc}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70 backdrop-blur">
                Ticket: <span className="text-white">{v.tt_name.trim() || "General"}</span>
              </span>

              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70 backdrop-blur">
                Desde:{" "}
                <span className="text-white">
                  {Number.isFinite(previewPrice) && v.tt_price !== "" ? `$${clp(previewPrice)}` : "—"}
                </span>
              </span>

              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70 backdrop-blur">
                Capacidad:{" "}
                <span className="text-white">
                  {Number.isFinite(previewCap) && v.tt_capacity !== "" ? clp(previewCap) : "—"}
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}