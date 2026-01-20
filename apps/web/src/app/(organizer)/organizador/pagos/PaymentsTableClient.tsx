// apps/web/src/app/(organizer)/organizador/pagos/PaymentsTableClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCLP } from "@/lib/events";
import type { PaymentListRow } from "@/lib/organizer.pg.server";

function StatusPill({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  const cls =
    s === "PAID"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
      : s === "PENDING" || s === "CREATED"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : s === "FAILED" || s === "CANCELLED"
      ? "border-red-500/20 bg-red-500/10 text-red-200"
      : "border-white/10 bg-white/5 text-white/70";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${cls}`}>
      {s || "UNKNOWN"}
    </span>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-CL");
  } catch {
    return iso;
  }
}

function SmallBtn({
  children,
  href,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const cls =
    "rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs backdrop-blur hover:bg-white/10 disabled:opacity-50";
  if (href) {
    return (
      <Link href={href} className={cls} aria-disabled={disabled} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export default function PaymentsTableClient({ rows }: { rows: PaymentListRow[] }) {
  const router = useRouter();

  const [busyKey, setBusyKey] = useState<string>("");
  const [msgById, setMsgById] = useState<Record<string, string>>({});

  const canCopy = useMemo(() => typeof navigator !== "undefined" && !!navigator.clipboard, []);

  async function reconcileStripe(paymentId: string, sessionId: string) {
    setBusyKey(paymentId);
    setMsgById((m) => ({ ...m, [paymentId]: "Revisando en DB…" }));

    try {
      const r = await fetch(
        `/api/payments/stripe/status?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" }
      );
      const data = await r.json().catch(() => null);

      if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);

      const done = !!data?.payment?.done;
      const ticketsCount = Number(data?.payment?.ticketsCount ?? 0);

      if (done) {
        setMsgById((m) => ({
          ...m,
          [paymentId]: `✅ Tickets emitidos (${ticketsCount}). Refrescando…`,
        }));
        router.refresh();
        return;
      }

      setMsgById((m) => ({
        ...m,
        [paymentId]: `⏳ Aún no hay tickets (ticketsCount=${ticketsCount}). Dale 2-5s y reintenta.`,
      }));
    } catch (e: any) {
      setMsgById((m) => ({ ...m, [paymentId]: `❌ ${String(e?.message || e)}` }));
    } finally {
      setBusyKey("");
    }
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur">
        <p className="text-white/80">Nada para mostrar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((x) => {
        const isStripe = (x.provider || "").toLowerCase() === "stripe";
        const sessionId = x.providerRef || "";

        const canReconcile =
          isStripe &&
          sessionId.startsWith("cs_") &&
          (x.status === "CREATED" || x.status === "PENDING" || x.status === "PAID");

        const hint = msgById[x.paymentId] || "";

        return (
          <div
            key={x.paymentId}
            className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              {/* Left */}
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={x.status} />
                  <span className="text-xs text-white/40">Pago</span>
                  <span className="text-xs font-mono text-white/80 break-all">{x.paymentId}</span>
                  {x.orderId ? (
                    <>
                      <span className="text-white/20">•</span>
                      <span className="text-xs text-white/40">ord</span>
                      <span className="text-xs font-mono text-white/70 break-all">{x.orderId}</span>
                    </>
                  ) : null}
                </div>

                <div className="text-sm text-white/80">
                  <span className="text-white/50">Cliente:</span>{" "}
                  <span className="break-all">{x.buyerEmail}</span>{" "}
                  {x.buyerName ? <span className="text-white/40">({x.buyerName})</span> : null}
                </div>

                <div className="text-sm text-white/70">
                  <span className="text-white/50">Evento:</span> {x.eventTitle}{" "}
                  {x.eventId ? <span className="text-white/40">({x.eventId})</span> : null}
                </div>

                <div className="text-xs text-white/45">
                  created: {fmtDate(x.createdAtISO)} • updated: {fmtDate(x.updatedAtISO)}
                  {x.paidAtISO ? <> • paid: {fmtDate(x.paidAtISO)}</> : null}
                </div>

                {sessionId ? (
                  <div className="text-xs text-white/50">
                    <span className="text-white/40">provider_ref:</span>{" "}
                    <span className="font-mono break-all text-white/70">{sessionId}</span>
                  </div>
                ) : null}

                {hint ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                    {hint}
                  </div>
                ) : null}
              </div>

              {/* Right */}
              <div className="flex flex-col items-end gap-3">
                <div className="text-right">
                  <p className="text-2xl font-semibold text-white">
                    ${formatCLP(x.amountClp)}{" "}
                    <span className="text-xs font-normal text-white/50">{x.currency || "CLP"}</span>
                  </p>
                  <p className="text-[11px] text-white/40">
                    {String(x.provider || "").toUpperCase() || "PROVIDER"}{" "}
                    {sessionId ? "• cs_ listo" : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <SmallBtn
                    href={`/mis-tickets?email=${encodeURIComponent(x.buyerEmail)}`}
                    title="Abrir mis-tickets con el email del cliente"
                  >
                    Ver tickets
                  </SmallBtn>

                  {sessionId ? (
                    <SmallBtn
                      href={`/checkout/success?session_id=${encodeURIComponent(sessionId)}`}
                      title="Abrir la página success con esta session"
                    >
                      Ver success
                    </SmallBtn>
                  ) : null}

                  {sessionId ? (
                    <SmallBtn
                      disabled={!canCopy}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(sessionId);
                        } catch {}
                      }}
                      title="Copiar session id (cs_...)"
                    >
                      Copiar cs_
                    </SmallBtn>
                  ) : null}

                  <button
                    disabled={!canReconcile || busyKey === x.paymentId}
                    onClick={() => reconcileStripe(x.paymentId, sessionId)}
                    className={[
                      "rounded-xl px-3 py-1.5 text-xs font-semibold",
                      canReconcile
                        ? "bg-white text-black hover:bg-white/90"
                        : "bg-white/10 text-white/40 cursor-not-allowed",
                    ].join(" ")}
                    title={
                      canReconcile
                        ? "Consulta /api/payments/stripe/status y refresca si ya hay tickets"
                        : "No hay sessionId de Stripe o no aplica"
                    }
                  >
                    {busyKey === x.paymentId ? "Revisando…" : "Revisar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
