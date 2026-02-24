export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";

export default function NuevoEventoPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Crear evento</h1>
        <p className="text-sm text-white/60">
          Al enviar, el evento queda <span className="text-white">en revisión</span>.
        </p>
      </div>

      <form
        action="/api/organizador/eventos/submit"
        method="POST"
        className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-white/70">
            Título
            <input
              name="title"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
              required
            />
          </label>

          <label className="block text-sm text-white/70">
            Ciudad
            <input
              name="city"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
              required
            />
          </label>

          <label className="block text-sm text-white/70 md:col-span-2">
            Lugar (venue)
            <input
              name="venue"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
              required
            />
          </label>

          <label className="block text-sm text-white/70">
            Fecha y hora (ISO)
            <input
              name="dateISO"
              placeholder="2026-04-22T17:00:00-03:00"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30"
              required
            />
          </label>

          <label className="block text-sm text-white/70">
            Imagen (opcional)
            <input
              name="image"
              placeholder="/events/mi-evento.jpg"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30"
            />
          </label>

          <label className="block text-sm text-white/70 md:col-span-2">
            Descripción
            <textarea
              name="description"
              rows={6}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
              required
            />
          </label>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-white/80">Ticket base</p>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm text-white/70">
              Nombre
              <input
                name="tt_name"
                defaultValue="General"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                required
              />
            </label>

            <label className="block text-sm text-white/70">
              Precio (CLP)
              <input
                name="tt_price"
                type="number"
                min={0}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                required
              />
            </label>

            <label className="block text-sm text-white/70">
              Capacidad
              <input
                name="tt_capacity"
                type="number"
                min={0}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                required
              />
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
        >
          Enviar a revisión
        </button>

        <div className="text-xs text-white/50">
          <Link href="/organizador" className="hover:text-white">
            ← volver al panel
          </Link>
        </div>
      </form>
    </div>
  );
}