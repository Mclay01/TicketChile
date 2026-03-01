// apps/web/src/app/(admin)/admin/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Ev = {
  id: string;
  slug: string;
  title: string;
  city: string;
  venue: string;
  date_iso: string;
  is_published: boolean;
};

export default function AdminDashboardPage() {
  const [tab, setTab] = useState<"pending" | "published">("pending");
  const [events, setEvents] = useState<Ev[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/events?tab=${tab}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      setEvents(j?.events || []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <main className="px-4 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Admin — Eventos</h1>

        <div className="flex gap-2 items-center">
          <button
            onClick={() => setTab("pending")}
            className={`px-3 py-2 rounded-xl border border-white/10 ${
              tab === "pending" ? "bg-white text-black" : "bg-white/5 text-white"
            }`}
          >
            Por confirmar
          </button>
          <button
            onClick={() => setTab("published")}
            className={`px-3 py-2 rounded-xl border border-white/10 ${
              tab === "published" ? "bg-white text-black" : "bg-white/5 text-white"
            }`}
          >
            Confirmados
          </button>

          <form action="/api/admin/logout" method="post">
            <button className="px-3 py-2 rounded-xl border border-white/10 bg-white/5">
              Salir
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-12 bg-white/5 px-4 py-3 text-xs text-white/70">
          <div className="col-span-5">Evento</div>
          <div className="col-span-3">Lugar</div>
          <div className="col-span-2">Fecha</div>
          <div className="col-span-2 text-right">Acción</div>
        </div>

        {busy ? (
          <div className="px-4 py-6 text-white/60">Cargando...</div>
        ) : events.length ? (
          events.map((e) => (
            <div key={e.id} className="grid grid-cols-12 px-4 py-3 border-t border-white/10">
              <div className="col-span-5">
                <div className="font-medium">{e.title}</div>
                <div className="text-xs text-white/60">{e.slug}</div>
              </div>
              <div className="col-span-3 text-sm text-white/80">
                {e.city} — {e.venue}
              </div>
              <div className="col-span-2 text-sm text-white/80">
                {new Date(e.date_iso).toLocaleString("es-CL")}
              </div>
              <div className="col-span-2 text-right">
                <Link className="text-sm underline" href={`/admin/eventos/${e.id}`}>
                  Ver
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-6 text-white/60">No hay eventos.</div>
        )}
      </div>
    </main>
  );
}