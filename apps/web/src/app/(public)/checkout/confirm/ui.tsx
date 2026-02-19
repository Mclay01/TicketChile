"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type Ticket = {
  id: string;
  orderId: string;
  eventId: string;
  ticketTypeName: string;
  buyerEmail: string;
  status: string;
};

type StatusPayload = {
  ok: true;
  payment: {
    id: string;
    holdId: string;
    orderId: string;
    provider?: string;
    status: string;
    buyerName: string;
    buyerEmail: string;
    eventTitle: string;
    amountClp: number;
  };
  tickets: Ticket[];
};

function formatCLP(n: number) {
  return new Intl.NumberFormat("es-CL").format(n);
}

const POLL_MS = 5000;
const TIMEOUT_MS = 45_000;

export default function CheckoutConfirmClient() {
  const sp = useSearchParams();
  const router = useRouter();

  // ✅ payment_id (Webpay/Fintoc/Flow)
  const paymentId = (sp.get("payment_id") ?? "").trim();

  // ✅ Flow token (lo agregamos en /api/payments/flow/return redirect)
  const flowToken = (sp.get("flow_token") ?? "").trim();

  // Legacy: Stripe
  const sessionId = (sp.get("session_id") ?? "").trim();

  const endpoint = useMemo(() => {
    if (paymentId) return `/api/payments/status?payment_id=${encodeURIComponent(paymentId)}`;
    if (sessionId) return `/api/payments/stripe/status?session_id=${encodeURIComponent(sessionId)}`;
    return "";
  }, [paymentId, sessionId]);

  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [polling, setPolling] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  // --- Refs anti-spam / anti-duplicado ---
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const startedAtRef = useRef<number>(0);
  const aliveRef = useRef(true);

  // ✅ evita re-kick múltiple de Flow
  const flowKickRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    clearTimer();
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    setPolling(false);
  }, [clearTimer]);

  const loadOnce = useCallback(
    async (opts?: { silent?: boolean; signal?: AbortSignal }) => {
      const silent = Boolean(opts?.silent);

      if (!silent) setLoading(true);
      if (!silent) setErr(null);

      if (!endpoint) {
        setErr("Falta payment_id o session_id en la URL.");
        setData(null);
        setLoading(false);
        return null;
      }

      try {
        const r = await fetch(endpoint, { cache: "no-store", signal: opts?.signal });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || `Error ${r.status}`);

        setData(j);
        return j as StatusPayload;
      } catch (e: any) {
        if (e?.name === "AbortError") return null;
        setErr(String(e?.message || e));
        setData(null);
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [endpoint]
  );

  // ✅ Flow kick: si volvió el usuario con flow_token y el webhook aún no pegó,
  // esto fuerza al backend a consultar Flow y finalizar (idempotente).
  const flowKick = useCallback(async () => {
    if (!paymentId) return;
    if (!flowToken) return;
    if (flowKickRef.current) return;

    flowKickRef.current = true;

    try {
      // POST /api/payments/flow/kick  body: { paymentId, token }
      await fetch("/api/payments/flow/kick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ paymentId, token: flowToken }),
      }).catch(() => null);
    } catch {
      // silencioso
    }
  }, [paymentId, flowToken]);

  // ✅ Poll “single-threaded”
  const poll = useCallback(async () => {
    if (!aliveRef.current) return;
    if (!endpoint) return;

    if (inFlightRef.current) {
      clearTimer();
      timerRef.current = window.setTimeout(poll, POLL_MS);
      return;
    }

    inFlightRef.current = true;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const j = await loadOnce({ silent: true, signal: ac.signal });

    inFlightRef.current = false;
    if (!aliveRef.current) return;

    const now = Date.now();
    const elapsedMs = startedAtRef.current ? now - startedAtRef.current : 0;
    setElapsed(Math.floor(elapsedMs / 1000));

    const ticketsReady = Boolean(j?.tickets?.length);
    const status = String(j?.payment?.status || "").toUpperCase();

    if (ticketsReady) {
      stopAll();
      setLoading(false);
      return;
    }

    if (status === "FAILED" || status === "CANCELLED") {
      stopAll();
      setLoading(false);
      return;
    }

    if (elapsedMs >= TIMEOUT_MS) {
      stopAll();
      setLoading(false);
      return;
    }

    clearTimer();
    timerRef.current = window.setTimeout(poll, POLL_MS);
  }, [clearTimer, loadOnce, endpoint, stopAll]);

  // Start / Reset cuando cambia paymentId/sessionId
  useEffect(() => {
    aliveRef.current = true;

    setData(null);
    setErr(null);
    setSendMsg(null);
    setElapsed(0);

    // reset kick al cambiar compra
    flowKickRef.current = false;

    if (!paymentId && !sessionId) {
      setErr("Falta payment_id o session_id en la URL.");
      setLoading(false);
      setPolling(false);
      return () => {
        aliveRef.current = false;
        stopAll();
      };
    }

    startedAtRef.current = Date.now();
    setPolling(true);

    (async () => {
      await flowKick();
      await loadOnce({ silent: false });
      clearTimer();
      timerRef.current = window.setTimeout(poll, POLL_MS);
    })();

    return () => {
      aliveRef.current = false;
      stopAll();
    };
  }, [paymentId, sessionId, loadOnce, clearTimer, poll, stopAll, flowKick]);

  // ✅ Reenvía por ticketId (no por orderId/email). Reenvía todos los tickets de la compra.
  async function resendEmail() {
    const tickets = Array.isArray(data?.tickets) ? data!.tickets : [];
    if (tickets.length === 0) return;

    setSending(true);
    setSendMsg(null);

    const sent = new Set<string>();
    const failed: Array<{ ticketId: string; error: string }> = [];

    try {
      for (const tk of tickets) {
        const r = await fetch("/api/tickets/resend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ ticketId: tk.id }),
        });

        const j = await r.json().catch(() => null);

        if (!r.ok) {
          failed.push({ ticketId: tk.id, error: j?.error || `Error ${r.status}` });
          continue;
        }

        const sentTo = Array.isArray(j?.sentTo) ? j.sentTo : [];
        for (const e of sentTo) sent.add(String(e));
      }

      if (sent.size > 0) {
        const list = Array.from(sent);
        setSendMsg(
          `Listo ✅ Reenviado a: ${list.join(", ")}${
            failed.length ? ` (fallaron ${failed.length} ticket(s))` : ""
          }`
        );
      } else {
        const detail = failed[0]?.error || "Falló el envío.";
        setSendMsg(`No se pudo reenviar: ${detail}`);
      }
    } catch (e: any) {
      setSendMsg(`No se pudo reenviar: ${String(e?.message || e)}`);
    } finally {
      setSending(false);
    }
  }

  async function addGoogleWallet() {
    const first = data?.tickets?.[0];
    if (!first) return;

    const r = await fetch(`/api/wallet/google/save-url?ticket_id=${encodeURIComponent(first.id)}`, {
      cache: "no-store",
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) {
      alert(j?.error || "No se pudo generar Google Wallet.");
      return;
    }

    const url = String(j?.saveUrl || "");
    if (!url) {
      alert("No se pudo generar Google Wallet.");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  const ready = Boolean(data?.tickets?.length);
  const provider = String(data?.payment?.provider || "").toLowerCase();
  const statusUpper = String(data?.payment?.status || "").toUpperCase();

  const waitingText = (() => {
    if (!data?.payment) return "Estamos esperando confirmación para emitir tus tickets.";
    if (provider === "webpay") return "Webpay confirmó el pago; estamos emitiendo tus tickets.";
    if (provider === "fintoc") return "Estamos esperando confirmación de la transferencia para emitir tus tickets.";
    if (provider === "transfer") return "Estamos procesando la transferencia para emitir tus tickets.";
    if (provider === "flow") return "Flow confirmó/está confirmando el pago; estamos emitiendo tus tickets.";
    return "Estamos procesando tu pago y emitiendo tickets.";
  })();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {ready ? "Compra confirmada" : "Confirmando tu compra…"}
        </h1>
        <p className="text-sm text-white/60">{ready ? "Tus tickets ya fueron emitidos." : waitingText}</p>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-white/80">Cargando…</p>
        </div>
      ) : err ? (
        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6">
          <p className="font-semibold text-white">Error</p>
          <p className="mt-1 text-sm text-white/70">{err}</p>
        </div>
      ) : data ? (
        <>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-white/50">Evento</p>
                <p className="text-lg font-semibold text-white">{data.payment.eventTitle}</p>
                <p className="mt-1 text-sm text-white/60">
                  Comprador: <span className="text-white/80">{data.payment.buyerEmail}</span>
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-white/50">Total</p>
                <p className="text-lg font-bold text-white">${formatCLP(data.payment.amountClp)}</p>
                <p className="mt-1 text-xs text-white/50">
                  Estado: <span className="text-white/80">{data.payment.status}</span>
                </p>
              </div>
            </div>

            {!ready ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="font-semibold text-white/90">Emitiendo tickets…</p>
                <p className="mt-1 text-sm text-white/70">
                  {polling ? (
                    <>
                      Reintentando cada {Math.round(POLL_MS / 1000)}s…{" "}
                      <span className="text-white/50">(van {elapsed}s)</span>
                    </>
                  ) : (
                    "Si no aparecen, refresca en unos segundos."
                  )}
                </p>

                {statusUpper === "CANCELLED" || statusUpper === "FAILED" ? (
                  <p className="mt-2 text-sm text-white/70">
                    Parece que el pago quedó{" "}
                    <span className="text-white/90 font-semibold">{statusUpper}</span>. Si fue un error, vuelve al evento
                    e intenta nuevamente.
                  </p>
                ) : null}

                {provider === "flow" && flowToken ? (
                  <p className="mt-2 text-xs text-white/50">
                    (Flow token recibido. Si el estado es asíncrono, puede tardar unos segundos en confirmarse.)
                  </p>
                ) : null}
              </div>
            ) : null}

            {ready ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => router.push(`/mis-tickets`)}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90"
                >
                  Ver mis tickets
                </button>

                <button
                  onClick={resendEmail}
                  disabled={sending}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50"
                >
                  {sending ? "Enviando…" : "Reenviar al correo"}
                </button>

                <button
                  onClick={addGoogleWallet}
                  className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
                >
                  Agregar a Google Wallet
                </button>

                {sendMsg ? <p className="md:col-span-2 text-xs text-white/60">{sendMsg}</p> : null}
              </div>
            ) : null}
          </div>

          {ready ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm font-semibold text-white">Tus tickets</p>
              <ul className="mt-3 space-y-2 text-sm text-white/75">
                {data.tickets.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                  >
                    <span>{t.ticketTypeName}</span>
                    <span className="text-xs text-white/50">{t.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
