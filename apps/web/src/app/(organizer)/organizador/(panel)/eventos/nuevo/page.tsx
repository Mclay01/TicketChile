export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";

/* UI tokens del panel (mismo estilo que el dashboard) */
const card =
  "rounded-3xl border border-white/10 bg-black/25 backdrop-blur-xl";

const input =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/20";

const label = "block text-sm text-white/70";

export default function NuevoEventoPage() {
  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Crear evento
        </h1>
        <p className="text-sm text-white/60">
          Al enviar, el evento queda{" "}
          <span className="text-white font-medium">en revisión</span>.
        </p>
      </div>

      {/* Form */}
      <form
        action="/api/organizador/eventos/submit"
        method="POST"
        className={`${card} p-8 space-y-6`}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <label className={label}>
            Título
            <input name="title" className={input} required />
          </label>

          <label className={label}>
            Ciudad
            <input name="city" className={input} required />
          </label>

          <label className={`${label} md:col-span-2`}>
            Lugar (venue)
            <input name="venue" className={input} required />
          </label>

          <label className={label}>
            Fecha y hora (ISO)
            <input
              name="dateISO"
              placeholder="2026-04-22T17:00:00-03:00"
              className={input}
              required
            />
          </label>

          <label className={label}>
            Imagen (opcional)
            <input
              name="image"
              placeholder="/events/mi-evento.jpg"
              className={input}
            />
          </label>

          <label className={`${label} md:col-span-2`}>
            Descripción
            <textarea name="description" rows={6} className={input} required />
          </label>
        </div>

        {/* Ticket base */}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
          <p className="text-sm font-semibold text-white/80">
            Ticket base
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={label}>
              Nombre
              <input
                name="tt_name"
                defaultValue="General"
                className={input}
                required
              />
            </label>

            <label className={label}>
              Precio (CLP)
              <input
                name="tt_price"
                type="number"
                min={0}
                className={input}
                required
              />
            </label>

            <label className={label}>
              Capacidad
              <input
                name="tt_capacity"
                type="number"
                min={0}
                className={input}
                required
              />
            </label>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90"
        >
          Enviar a revisión
        </button>

        {/* Back */}
        <div className="text-xs text-white/50">
          <Link href="/organizador" className="hover:text-white">
            ← volver al panel
          </Link>
        </div>
      </form>
    </div>
  );
}