// apps/web/src/app/(admin)/admin/eventos/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminEventDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [ev, setEv] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch(`/api/admin/event/${params.id}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    setEv(j?.event || null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function publish() {
    setBusy(true);
    try {
      await fetch(`/api/admin/events/${params.id}/publish`, { method: "POST" });
      router.push("/admin");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    try {
      await fetch(`/api/admin/events/${params.id}/unpublish`, { method: "POST" });
      router.push("/admin");
    } finally {
      setBusy(false);
    }
  }

  if (!ev) return <main className="px-4 py-8 max-w-4xl mx-auto text-white/60">Cargando...</main>;

  return (
    <main className="px-4 py-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{ev.title}</h1>
          <div className="text-sm text-white/60">{ev.slug}</div>
        </div>

        <div className="flex gap-2">
          {ev.is_published ? (
            <button
              onClick={unpublish}
              disabled={busy}
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5"
            >
              Despublicar
            </button>
          ) : (
            <button
              onClick={publish}
              disabled={busy}
              className="px-3 py-2 rounded-xl bg-white text-black font-medium"
            >
              Confirmar y publicar
            </button>
          )}

          <button
            onClick={() => router.push("/admin")}
            className="px-3 py-2 rounded-xl border border-white/10 bg-white/5"
          >
            Volver
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3 text-sm">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-white/70">Ciudad / Venue</div>
          <div className="mt-1">{ev.city} — {ev.venue}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-white/70">Fecha</div>
          <div className="mt-1">{new Date(ev.date_iso).toLocaleString("es-CL")}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-white/70">Descripción</div>
          <div className="mt-2 whitespace-pre-wrap">{ev.description}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-white/70">Estado</div>
          <div className="mt-1">{ev.is_published ? "Confirmado / Publicado" : "En revisión (no publicado)"}</div>
        </div>
      </div>
    </main>
  );
}