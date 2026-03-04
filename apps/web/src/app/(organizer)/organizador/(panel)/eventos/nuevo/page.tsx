export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";

const card = "rounded-xl border border-black/10 bg-white shadow-sm";
const input =
  "mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black outline-none placeholder:text-black/40";
const label = "block text-sm text-black/70";

export default function NuevoEventoPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Crear evento</h1>
        <p className="text-sm text-white/70">
          Al enviar, el evento queda <span className="text-white">en revisión</span>.
        </p>
      </div>

      <form
        action="/api/organizador/eventos/submit"
        method="POST"
        className={`${card} p-6 space-y-5`}
      >
        <div className="grid gap-4 md:grid-cols-2">
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
            <input name="image" placeholder="/events/mi-evento.jpg" className={input} />
          </label>

          <label className={`${label} md:col-span-2`}>
            Descripción
            <textarea name="description" rows={6} className={input} required />
          </label>
        </div>

        <div className={`${card} p-5`}>
          <p className="text-sm font-semibold text-black/80">Ticket base</p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={label}>
              Nombre
              <input name="tt_name" defaultValue="General" className={input} required />
            </label>

            <label className={label}>
              Precio (CLP)
              <input name="tt_price" type="number" min={0} className={input} required />
            </label>

            <label className={label}>
              Capacidad
              <input name="tt_capacity" type="number" min={0} className={input} required />
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-black/90"
        >
          Enviar a revisión
        </button>

        <div className="text-xs text-black/50">
          <Link href="/organizador" className="hover:text-black">
            ← volver al panel
          </Link>
        </div>
      </form>
    </div>
  );
}