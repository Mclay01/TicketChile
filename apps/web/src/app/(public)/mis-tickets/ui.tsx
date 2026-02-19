// apps/web/src/app/(public)/mis-tickets/ui.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
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

function normalizeEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export default function MisTicketsClient({ email }: { email: string }) {
  const { data: session, status: sessionStatus } = useSession();
  const sessionEmail = normalizeEmail(session?.user?.email);

  // ✅ Fuente de verdad: sesión. Fallback: prop (por si tu page.tsx aún lo pasa).
  const effectiveEmail = sessionEmail || normalizeEmail(email);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const endpoint = useMemo(() => {
    if (!effectiveEmail) return "";
    return apiUrl(`/tickets?email=${encodeURIComponent(effectiveEmail)}`);
  }, [effectiveEmail]);

  async function loadTickets() {
    setLoading(true);
    setErr(null);

    // Si aún no hay email resoluble, no pegamos al backend.
    if (!effectiveEmail) {
      setTickets([]);
      setLoading(false);
      return;
    }

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

  // ✅ Espera a que NextAuth resuelva la sesión antes de disparar la carga.
  useEffect(() => {
    if (sessionStatus === "loading") return;

    // Si no hay sesión y tampoco email fallback => no hay nada que hacer.
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, endpoint]);

  const sessionReady = sessionStatus !== "loading";
  const isLoggedIn = Boolean(sessionEmail);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mis tickets</h1>

          {!sessionReady ? (
            <p className="mt-1 text-sm text-white/70">Cargando sesión…</p>
          ) : isLoggedIn ? (
            <p className="mt-1 text-sm text-white/70">
              Sesión iniciada como <span className="text-white">{sessionEmail}</span>
            </p>
          ) : effectiveEmail ? (
            <p className="mt-1 text-sm text-white/70">
              Mostrando tickets por email (fallback): <span className="text-white">{effectiveEmail}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-white/70">
              No hay sesión iniciada. Inicia sesión para ver tus tickets.
            </p>
          )}
        </div>

        <button
          onClick={loadTickets}
          disabled={!effectiveEmail || sessionStatus === "loading"}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Refrescar
        </button>
      </div>

      {sessionStatus === "loading" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-white/80">Cargando…</p>
        </div>
      ) : !effectiveEmail ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-white/80">No puedes ver tickets sin sesión.</p>
          <p className="mt-1 text-sm text-white/60">Inicia sesión y vuelve.</p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-white/80">Cargando…</p>
        </div>
      ) : err ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <p className="text-white/90 font-semibold">Error</p>
          <p className="mt-1 text-sm text-white/70">{err}</p>
          <p className="mt-2 text-xs text-white/50">Endpoint: {endpoint || "(sin endpoint)"}</p>
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
