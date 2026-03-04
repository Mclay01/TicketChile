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
      ? "border-emerald-600/20 bg-emerald-50 text-emerald-800"
      : s === "PENDING" || s === "CREATED"
      ? "border-amber-600/20 bg-amber-50 text-amber-800"
      : s === "FAILED" || s === "CANCELLED"
      ? "border-red-600/20 bg-red-50 text-red-800"
      : "border-black/10 bg-white text-black/60";

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
    "rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-black/80 hover:bg-black/5 disabled:opacity-50";
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
        setMsgById((m) => ({ ...m, [paymentId]: `✅ Tickets emitidos (${ticketsCount}). Refrescando…` }));
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
      <div className="rounded-xl border border-black/10 bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
        <p className="text-black/80">Nada para mostrar.</p>
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
            className="rounded-xl border border-black/10 bg-white p-5 shadow-[0_10px_22px_rgba(0,0,0,0.16)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={x.status} />
                  <span className="text-xs text-black/40">Pago</span>
                  <span className="text-xs font-mono text-black/80 break-all">{x.paymentId}</span>
                  {x.orderId ? (
                    <>
                      <span className="text-black/20">•</span>
                      <span className="text-xs text-black/40">ord</span>
                      <span className="text-xs font-mono text-black/70 break-all">{x.orderId}</span>
                    </>
                  ) : null}
                </div>

                <div className="text-sm text-black/80">
                  <span className="text-black/50">Cliente:</span>{" "}
                  <span className="break-all">{x.buyerEmail}</span>{" "}
                  {x.buyerName ? <span className="text-black/45">({x.buyerName})</span> : null}
                </div>

                <div className="text-sm text-black/70">
                  <span className="text-black/50">Evento:</span> {x.eventTitle}{" "}
                  {x.eventId ? <span className="text-black/40">({x.eventId})</span> : null}
                </div>

                <div className="text-xs text-black/45">
                  created: {fmtDate(x.createdAtISO)} • updated: {fmtDate(x.updatedAtISO)}
                  {x.paidAtISO ? <> • paid: {fmtDate(x.paidAtISO)}</> : null}
                </div>

                {sessionId ? (
                  <div className="text-xs text-black/55">
                    <span className="text-black/40">provider_ref:</span>{" "}
                    <span className="font-mono break-all text-black/70">{sessionId}</span>
                  </div>
                ) : null}

                {hint ? (
                  <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-black/70">
                    {hint}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col items-end gap-3">
                <div className="text-right">
                  <p className="text-2xl font-semibold text-black">
                    ${formatCLP(x.amountClp)}{" "}
                    <span className="text-xs font-normal text-black/50">{x.currency || "CLP"}</span>
                  </p>
                  <p className="text-[11px] text-black/40">
                    {String(x.provider || "").toUpperCase() || "PROVIDER"} {sessionId ? "• cs_ listo" : ""}
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
                      "rounded-lg px-3 py-1.5 text-xs font-semibold",
                      canReconcile
                        ? "bg-black text-white hover:bg-black/90"
                        : "bg-black/10 text-black/40 cursor-not-allowed",
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