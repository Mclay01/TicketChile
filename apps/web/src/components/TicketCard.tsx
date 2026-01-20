"use client";

import type { Ticket } from "@/lib/storage";
import { apiUrl } from "@/lib/api";

export default function TicketCard({ t }: { t: Ticket }) {
  // QR firmado (server)
  const qrUrl = apiUrl(
    `/qr?ticketId=${encodeURIComponent(t.id)}&eventId=${encodeURIComponent(t.eventId)}`
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/70">{t.ticketTypeName}</p>
          <h3 className="mt-1 text-base font-semibold">{t.eventTitle}</h3>
          <p className="mt-1 text-xs text-white/50">TicketId: {t.id}</p>
        </div>

        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
          {t.status === "VALID" ? "Válido" : "Usado"}
        </span>
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
        </div>
      </div>
    </div>
  );
}
