// apps/web/src/app/(public)/mis-tickets/ui.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import TicketCard from "@/components/TicketCard";
import { apiUrl } from "@/lib/api";

type Ticket = {
  id: string;
  orderId: string;
  eventId: string;
  eventTitle: string;
  ticketTypeName: string;
  buyerEmail: string;
  status: "VALID" | "USED" | "CANCELLED";
};

export default function MisTicketsClient({ email }: { email: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const endpoint = useMemo(() => {
    return apiUrl(`/tickets?email=${encodeURIComponent(email)}`);
  }, [email]);

  async function loadTickets() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(endpoint, { cache: "no-store" });
      const data = await r.json().catch(() => null);

      if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);

      const list = Array.isArray(data?.tickets)
        ? data.tickets
        : Array.isArray(data)
        ? data
        : [];

      setTickets(list);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mis tickets</h1>
          <p className="mt-1 text-sm text-white/70">
            Sesión iniciada como <span className="text-white">{email}</span>
          </p>
        </div>

        <button
          onClick={loadTickets}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          Refrescar
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-white/80">Cargando…</p>
        </div>
      ) : err ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <p className="text-white/90 font-semibold">Error</p>
          <p className="mt-1 text-sm text-white/70">{err}</p>
          <p className="mt-2 text-xs text-white/50">Endpoint: {endpoint}</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-white/80">No tienes tickets aún.</p>
          <p className="mt-1 text-sm text-white/60">
            Ve a <span className="text-white">Eventos</span>, compra y vuelve.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tickets.map((t) => (
            <TicketCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
