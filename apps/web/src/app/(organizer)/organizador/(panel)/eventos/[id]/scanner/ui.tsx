"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRScanner from "@/components/QRScanner";

type CheckinTicket = {
  id: string;
  ticketTypeName: string;
  buyerEmail: string;
  status: "VALID" | "USED";
  usedAtISO?: string;
};

type Props = {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventCity: string;
  eventVenue: string;
};

type Stats = {
  capacity: number;
  held: number;
  remaining: number; // real
  issued: number; // VALID + USED (real)
  used: number; // USED
  pending: number; // VALID
  soldCounter: number; // ticket_types.sold (debug)
};

function pickNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapStats(s: any): Stats {
  const capacity = pickNumber(s?.totals?.capacity ?? s?.capacity);
  const held = pickNumber(s?.totals?.held ?? s?.held);

  const pending = pickNumber(s?.totals?.pending ?? s?.pending ?? s?.valid);
  const used = pickNumber(s?.totals?.used ?? s?.used ?? s?.validated);

  const issued = pending + used;

  const soldCounter = pickNumber(s?.totals?.sold ?? s?.sold);

  const remaining = Math.max(capacity - issued - held, 0);

  return { capacity, held, pending, used, issued, remaining, soldCounter };
}

function looksLikeTicketId(raw: string) {
  return /^tix_[a-z0-9]+$/i.test(raw);
}

/** ====== UI atoms (white cards on dark shell) ====== */
const cardBase = "rounded-xl border border-black/10 bg-white shadow-sm";
const subText = "text-black/60";
const hairline = "border-black/10";

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`${cardBase} p-6`}>
      {title || subtitle || right ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-lg font-semibold text-black">{title}</h2> : null}
            {subtitle ? <p className={`mt-1 text-sm ${subText}`}>{subtitle}</p> : null}
          </div>
          {right ? <div className="flex items-center gap-2">{right}</div> : null}
        </div>
      ) : null}

      <div className={title || subtitle || right ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className={`${cardBase} p-5`}>
      <p className={`text-sm ${subText}`}>{label}</p>
      <p className="mt-2 text-3xl font-semibold text-black">{value}</p>
      {hint ? <p className="mt-2 text-[11px] text-black/50">{hint}</p> : null}
    </div>
  );
}

function GhostButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/15"
    >
      {children}
    </Link>
  );
}

function GhostAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/15"
    >
      {children}
    </a>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export default function ScannerUI({
  eventId,
  eventTitle,
  eventSlug,
  eventCity,
  eventVenue,
}: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [checkins, setCheckins] = useState<CheckinTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const exportAllHref = useMemo(
    () => `/api/demo/export?eventId=${encodeURIComponent(eventId)}`,
    [eventId]
  );
  const exportUsedHref = useMemo(
    () => `/api/demo/export?eventId=${encodeURIComponent(eventId)}&status=USED`,
    [eventId]
  );

  // ===== SCAN STATE =====
  const lastScanRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const scanBusyRef = useRef(false);

  const [scanMsg, setScanMsg] = useState<{ type: "ok" | "warn" | "err"; text: string } | null>(
    null
  );
  const [scanBusy, setScanBusy] = useState(false);
  const [manual, setManual] = useState("");

  const clearMsgTimerRef = useRef<number | null>(null);

  function setMsgSafe(
    msg: { type: "ok" | "warn" | "err"; text: string } | null,
    autoClearMs = 2500
  ) {
    if (clearMsgTimerRef.current) window.clearTimeout(clearMsgTimerRef.current);
    setScanMsg(msg);
    if (msg) {
      clearMsgTimerRef.current = window.setTimeout(() => setScanMsg(null), autoClearMs);
    } else {
      clearMsgTimerRef.current = null;
    }
  }

  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      const [s, c] = await Promise.all([
        fetch(`/api/demo/event-stats?eventId=${encodeURIComponent(eventId)}`, {
          cache: "no-store",
        }).then((r) => r.json()),
        fetch(`/api/demo/event-checkins?eventId=${encodeURIComponent(eventId)}`, {
          cache: "no-store",
        }).then((r) => r.json()),
      ]);

      if (!s?.ok) throw new Error(s?.error || "No pude cargar stats.");
      if (!c?.ok) throw new Error(c?.error || "No pude cargar check-ins.");

      setStats(mapStats(s));
      setCheckins(Array.isArray(c.checkins) ? c.checkins : []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function validateScan(qrTextOrTicketId: string) {
    const raw = (qrTextOrTicketId ?? "").trim();
    if (!raw) return;

    const now = Date.now();
    if (raw === lastScanRef.current.text && now - lastScanRef.current.at < 1500) return;
    lastScanRef.current = { text: raw, at: now };

    if (scanBusyRef.current) return;
    scanBusyRef.current = true;

    setScanBusy(true);
    setMsgSafe({ type: "warn", text: "Validando…" }, 999999);

    try {
      const payload = looksLikeTicketId(raw) ? { eventId, ticketId: raw } : { eventId, qrText: raw };

      const r = await fetch("/api/demo/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      const data = await r.json().catch(() => null);

      if (r.status === 409 && String(data?.error ?? "").toLowerCase().includes("ya fue usado")) {
        setMsgSafe({ type: "warn", text: "Ticket ya fue usado ⚠️" });
        await refresh();
        return;
      }

      if (r.status === 404) {
        setMsgSafe({ type: "err", text: "Ticket no existe 😬" });
        return;
      }

      if (!r.ok || !data?.ok) {
        setMsgSafe({ type: "err", text: data?.error || `Error ${r.status}` });
        return;
      }

      setMsgSafe({ type: "ok", text: "Ticket validado ✅" });
      await refresh();
    } finally {
      setScanBusy(false);
      scanBusyRef.current = false;
    }
  }

  useEffect(() => {
    refresh();
    return () => {
      if (clearMsgTimerRef.current) window.clearTimeout(clearMsgTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const mismatch = stats ? stats.soldCounter !== stats.issued : false;

  // pill arriba del Card (match blanco)
  const scanMsgClass =
    scanMsg?.type === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : scanMsg?.type === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-800"
      : "border-red-500/30 bg-red-500/10 text-red-700";

  return (
    <div className="space-y-6">
      {/* Header (sobre fondo oscuro del layout) */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/organizador" className="text-sm text-white/70 hover:text-white">
            ← Volver al organizador
          </Link>

          <h1 className="text-3xl font-semibold tracking-tight text-white">Scanner QR</h1>

          <p className="text-sm text-white/70">
            {eventTitle} <span className="text-white/30">•</span> {eventCity}{" "}
            <span className="text-white/30">•</span> {eventVenue}
          </p>

          <p className="text-xs text-white/50">
            EventId: <span className="font-mono text-white/80">{eventId}</span>
          </p>

          {mismatch ? (
            <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              ⚠️ sold(counter)=<span className="font-mono">{stats?.soldCounter}</span> vs emitidos=
              <span className="font-mono">{stats?.issued}</span>. En puerta manda emitidos
              (VALID+USED).
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <GhostButton href={`/eventos/${eventSlug}`}>Ver evento público</GhostButton>
          <GhostAnchor href={exportAllHref}>Export CSV</GhostAnchor>
          <GhostAnchor href={exportUsedHref}>CSV (solo usados)</GhostAnchor>

          <PrimaryBtn onClick={() => refresh()} disabled={loading}>
            {loading ? "Cargando…" : "Recargar"}
          </PrimaryBtn>
        </div>
      </header>

      {/* Error global */}
      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="font-semibold text-white">Error</p>
          <p className="mt-1 text-sm text-white/70">{err}</p>
        </div>
      ) : null}

      {/* KPIs (white cards) */}
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi
          label="Emitidos (VALID+USED)"
          value={stats?.issued ?? (loading ? "…" : 0)}
          hint={stats ? `Capacidad ${stats.capacity} • Hold ${stats.held}` : undefined}
        />
        <Kpi label="Validados (USED)" value={stats?.used ?? (loading ? "…" : 0)} />
        <Kpi label="Pendientes (VALID)" value={stats?.pending ?? (loading ? "…" : 0)} />
        <Kpi label="Disponibles (real)" value={stats?.remaining ?? (loading ? "…" : 0)} />
      </div>

      {/* Scan (white card) */}
      <Card
        title="Escaneo"
        subtitle="Escanea el QR o pega manualmente. Si suben contadores, el scanner está vivo (aunque nervioso)."
        right={
          scanMsg ? (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${scanMsgClass}`}
            >
              {scanMsg.text}
            </span>
          ) : null
        }
      >
        <div className="space-y-4">
          {/* QRScanner intacto */}
          <QRScanner onResult={(text) => void validateScan(text)} />

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Pega tc1..., URL, JSON o ticketId (tix_...)"
              className={`w-full rounded-lg border ${hairline} bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-black/40`}
            />

            <button
              disabled={scanBusy || manual.trim().length === 0}
              onClick={() => void validateScan(manual)}
              className="rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-black/90 disabled:opacity-40"
            >
              {scanBusy ? "Validando…" : "Validar"}
            </button>
          </div>

          {/* Mensaje grande (solo error duro) */}
          {scanMsg && scanMsg.type === "err" ? (
            <div className={`rounded-lg border p-3 text-sm ${scanMsgClass}`}>{scanMsg.text}</div>
          ) : null}
        </div>
      </Card>

      {/* Checkins (white card) */}
      <Card title="Últimos check-ins" subtitle="Últimos 30 tickets usados en puerta.">
        <div className="space-y-2">
          {loading ? (
            <p className={`text-sm ${subText}`}>Cargando…</p>
          ) : checkins.length === 0 ? (
            <p className={`text-sm ${subText}`}>Aún no hay check-ins.</p>
          ) : (
            checkins.slice(0, 30).map((t, idx) => (
              <div
                key={`${t.id ?? "noid"}-${t.usedAtISO ?? ""}-${idx}`}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border ${hairline} bg-white px-4 py-3`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-black">{t.ticketTypeName}</p>
                  <p className={`text-xs ${subText} break-all`}>{t.buyerEmail}</p>
                </div>

                <div className="text-right">
                  <p className="text-xs font-mono text-black/70 break-all">{t.id}</p>
                  <p className={`text-xs ${subText}`}>
                    {t.usedAtISO ? new Date(t.usedAtISO).toLocaleString("es-CL") : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}