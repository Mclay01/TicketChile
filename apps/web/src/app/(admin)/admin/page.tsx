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

type Org = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  verified: boolean;
  approved: boolean;
  created_at: string;
};

export default function AdminDashboardPage() {
  const [section, setSection] = useState<"events" | "organizers">("events");

  // --- EVENTOS ---
  const [tab, setTab] = useState<"pending" | "published">("pending");
  const [events, setEvents] = useState<Ev[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadEvents() {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/events?tab=${tab}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      setEvents(j?.events || []);
    } finally {
      setBusy(false);
    }
  }

  // --- ORGANIZADORES ---
  const [orgTab, setOrgTab] = useState<"pending" | "approved">("pending");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgErr, setOrgErr] = useState<string | null>(null);

  async function loadOrganizers() {
    setOrgErr(null);
    setOrgBusy(true);
    try {
      const r = await fetch(`/api/admin/organizers?status=${orgTab}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "No se pudieron cargar organizadores.");
      setOrgs(j?.organizers || []);
    } catch (e: any) {
      setOrgErr(e?.message || "Error.");
      setOrgs([]);
    } finally {
      setOrgBusy(false);
    }
  }

  async function approveOrganizer(id: string) {
    setOrgErr(null);
    setOrgBusy(true);
    try {
      const r = await fetch(`/api/admin/organizers/${encodeURIComponent(id)}/approve`, {
        method: "POST",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "No se pudo aprobar.");

      await loadOrganizers();
    } catch (e: any) {
      setOrgErr(e?.message || "Error.");
      setOrgBusy(false);
    }
  }

  // Effects
  useEffect(() => {
    if (section === "events") loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, tab]);

  useEffect(() => {
    if (section === "organizers") loadOrganizers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, orgTab]);

  return (
    <main className="px-4 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Admin — Panel</h1>

        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => setSection("events")}
            className={`px-3 py-2 rounded-xl border border-white/10 ${
              section === "events" ? "bg-white text-black" : "bg-white/5 text-white"
            }`}
          >
            Eventos
          </button>

          <button
            onClick={() => setSection("organizers")}
            className={`px-3 py-2 rounded-xl border border-white/10 ${
              section === "organizers" ? "bg-white text-black" : "bg-white/5 text-white"
            }`}
          >
            Organizadores
          </button>

          <form action="/api/admin/logout" method="post">
            <button className="px-3 py-2 rounded-xl border border-white/10 bg-white/5">
              Salir
            </button>
          </form>
        </div>
      </div>

      {/* ===================== EVENTOS ===================== */}
      {section === "events" ? (
        <>
          <div className="mt-6 flex gap-2 items-center">
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
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
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
        </>
      ) : null}

      {/* ===================== ORGANIZADORES ===================== */}
      {section === "organizers" ? (
        <>
          <div className="mt-6 flex gap-2 items-center">
            <button
              onClick={() => setOrgTab("pending")}
              className={`px-3 py-2 rounded-xl border border-white/10 ${
                orgTab === "pending" ? "bg-white text-black" : "bg-white/5 text-white"
              }`}
            >
              Pendientes
            </button>

            <button
              onClick={() => setOrgTab("approved")}
              className={`px-3 py-2 rounded-xl border border-white/10 ${
                orgTab === "approved" ? "bg-white text-black" : "bg-white/5 text-white"
              }`}
            >
              Aprobados
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-12 bg-white/5 px-4 py-3 text-xs text-white/70">
              <div className="col-span-4">Organizador</div>
              <div className="col-span-4">Contacto</div>
              <div className="col-span-2">Registro</div>
              <div className="col-span-2 text-right">Acción</div>
            </div>

            {orgErr ? (
              <div className="px-4 py-4 text-sm text-red-400 border-t border-white/10">{orgErr}</div>
            ) : null}

            {orgBusy ? (
              <div className="px-4 py-6 text-white/60 border-t border-white/10">Cargando...</div>
            ) : orgs.length ? (
              orgs.map((o) => (
                <div key={o.id} className="grid grid-cols-12 px-4 py-3 border-t border-white/10">
                  <div className="col-span-4">
                    <div className="font-medium">{o.display_name || o.username}</div>
                    <div className="text-xs text-white/60">{o.id}</div>
                  </div>

                  <div className="col-span-4 text-sm text-white/80">
                    <div>{o.email || "—"}</div>
                    <div className="text-xs text-white/60">{o.phone || ""}</div>
                  </div>

                  <div className="col-span-2 text-sm text-white/80">
                    {new Date(o.created_at).toLocaleString("es-CL")}
                  </div>

                  <div className="col-span-2 text-right">
                    {o.approved ? (
                      <span className="text-xs text-white/60">OK</span>
                    ) : (
                      <button
                        onClick={() => approveOrganizer(o.id)}
                        className="text-sm rounded-xl bg-white text-black px-3 py-2 disabled:opacity-60"
                        disabled={orgBusy || orgTab !== "pending"}
                      >
                        Aprobar
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-white/60 border-t border-white/10">
                No hay organizadores {orgTab === "pending" ? "pendientes" : "aprobados"}.
              </div>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}