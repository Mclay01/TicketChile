"use client";

import { useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";

type TicketCardTicket = {
  id: string;
  eventId: string;
  eventTitle: string;
  ticketTypeName: string;
  status: "VALID" | "USED" | "CANCELLED" | string;
};

export default function TicketCard({ t }: { t: TicketCardTicket }) {
  // QR firmado (server)
  const qrUrl = useMemo(() => {
    return apiUrl(
      `/qr?ticketId=${encodeURIComponent(t.id)}&eventId=${encodeURIComponent(t.eventId)}`
    );
  }, [t.id, t.eventId]);

  const [sending, setSending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusLabel =
    t.status === "VALID" ? "Válido" : t.status === "USED" ? "Usado" : "Cancelado";

  const statusBadgeClass =
    t.status === "VALID"
      ? "bg-white/10"
      : t.status === "USED"
      ? "bg-emerald-500/15 text-emerald-200"
      : "bg-red-500/15 text-red-200";

  async function resendTicket() {
    setSending(true);
    setInfo(null);
    setError(null);

    try {
      const r = await fetch("/api/tickets/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId: t.id }), // ✅ CLAVE: ticketId correcto
      });

      const data = await r.json().catch(() => null);

      if (!r.ok) {
        throw new Error(data?.error || `Error ${r.status}`);
      }

      const sentTo = Array.isArray(data?.sentTo) ? data.sentTo : [];
      setInfo(sentTo.length ? `Enviado a: ${sentTo.join(", ")}` : "Enviado.");
    } catch (e: any) {
      setError(`No se pudo reenviar: ${String(e?.message || e)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/70">{t.ticketTypeName}</p>
          <h3 className="mt-1 text-base font-semibold">{t.eventTitle}</h3>
          <p className="mt-1 text-xs text-white/50">TicketId: {t.id}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}>
            {statusLabel}
          </span>

          <button
            onClick={resendTicket}
            disabled={sending}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-50"
            title="Reenvía este ticket al correo del checkout y al correo de tu cuenta"
          >
            {sending ? "Reenviando…" : "Reenviar al correo"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <img
          src={qrUrl}
          alt="QR Ticket"
          className="h-[140px] w-[140px] rounded-xl border border-white/10 bg-black/30"
          loading="lazy"
        />

        <div className="flex-1 text-sm text-white/70">
          <p>Presenta este QR en la entrada.</p>
          <p className="mt-2 text-xs text-white/50">
            (QR firmado por el server — falsificarlo “a ojímetro” no funciona)
          </p>

          {info ? (
            <p className="mt-3 text-xs text-emerald-200">{info}</p>
          ) : null}

          {error ? (
            <p className="mt-3 text-xs text-red-200">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
