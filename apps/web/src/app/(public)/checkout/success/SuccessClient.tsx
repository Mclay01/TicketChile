// apps/web/src/app/(public)/checkout/success/SuccessClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function SuccessClient({
  paid,
  misTicketsHref,
  sessionId,
  buyerEmail,
}: {
  paid: boolean;
  misTicketsHref: string;
  sessionId: string;
  buyerEmail: string;
}) {
  const router = useRouter();

  const canCopy = useMemo(() => typeof navigator !== "undefined" && !!navigator.clipboard, []);
  const [seconds, setSeconds] = useState(paid ? 2 : 0);

  useEffect(() => {
    if (!paid) return;

    setSeconds(2);
    const t1 = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    const t2 = window.setTimeout(() => router.replace(misTicketsHref), 2000);

    return () => {
      window.clearInterval(t1);
      window.clearTimeout(t2);
    };
  }, [paid, misTicketsHref, router]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      {paid ? (
        <>
          <p className="text-sm text-white/80">
            Te llevo a <span className="text-white font-semibold">Mis tickets</span> en{" "}
            <span className="text-white font-semibold">{seconds}s</span>…
          </p>
          <p className="mt-1 text-xs text-white/50">
            Si justo cae el rayo del timing, recarga Mis tickets y listo. (No es brujería, es async.)
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-white/80 font-semibold">Aún no está confirmado como “paid”.</p>
          <p className="mt-1 text-sm text-white/70">
            Si pagaste recién, espera un momento y recarga. Si te devolvió con cancelación/3DS fallida, esto queda
            pendiente.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => router.refresh()}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Reintentar estado
            </button>

            <button
              onClick={() => router.replace(misTicketsHref)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Ir a Mis tickets
            </button>
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/50">
        {sessionId ? (
          <button
            disabled={!canCopy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sessionId);
              } catch {}
            }}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-1 hover:bg-black/30 disabled:opacity-50"
            title="Copiar session_id"
          >
            Copiar session_id
          </button>
        ) : null}

        {buyerEmail ? (
          <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1">
            email: <span className="text-white/70">{buyerEmail}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
