// apps/web/src/app/(admin)/admin/organizadores/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminOrganizersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/organizers?status=pending", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    setItems(j?.organizers || []);
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/organizers/${id}/approve`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="px-4 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Admin — Organizadores</h1>
        <Link className="text-sm underline" href="/admin">Volver a eventos</Link>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-12 bg-white/5 px-4 py-3 text-xs text-white/70">
          <div className="col-span-4">Organizador</div>
          <div className="col-span-4">Contacto</div>
          <div className="col-span-2">Estado</div>
          <div className="col-span-2 text-right">Acción</div>
        </div>

        {items.length ? items.map((o) => (
          <div key={o.id} className="grid grid-cols-12 px-4 py-3 border-t border-white/10">
            <div className="col-span-4">
              <div className="font-medium">{o.display_name || o.username}</div>
              <div className="text-xs text-white/60">{o.username}</div>
            </div>
            <div className="col-span-4 text-sm text-white/80">
              <div>{o.email || "-"}</div>
              <div className="text-xs text-white/60">{o.phone || "-"}</div>
            </div>
            <div className="col-span-2 text-sm text-white/80">
              {o.verified ? "Verificado" : "No verificado"}
            </div>
            <div className="col-span-2 text-right">
              <button
                onClick={() => approve(o.id)}
                disabled={busyId === o.id}
                className="px-3 py-2 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-60"
              >
                {busyId === o.id ? "Aprobando..." : "Aprobar"}
              </button>
            </div>
          </div>
        )) : (
          <div className="px-4 py-6 text-white/60">No hay organizadores pendientes.</div>
        )}
      </div>
    </main>
  );
}