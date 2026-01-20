"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EVENTS, eventPriceFrom, formatCLP, formatDateLong } from "@/lib/events";
import type { DashboardStats } from "@/lib/organizer.pg.server";
import ResetDemoButton from "./ResetDemoButton";

type StatsByEvent = Record<string, DashboardStats>;

const glassCard =
  "rounded-2xl border border-white/10 bg-black/30 backdrop-blur";
const glassSoft =
  "rounded-xl border border-white/10 bg-black/20 backdrop-blur";
const pillBase =
  "inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80 backdrop-blur";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={glassSoft + " p-3"}>
      <p className="text-white/60 text-xs">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: number }) {
  return (
    <span className={pillBase}>
      <span className="text-white/60">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </span>
  );
}

function percent(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function msAgoLabel(msAgo: number) {
  const s = Math.floor(msAgo / 1000);
  if (s < 2) return "recién";
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  return `hace ${m}m`;
}

export default function OrganizadorClient({
  initialStatsByEvent,
  refreshMs = 12000,
}: {
  initialStatsByEvent: StatsByEvent;
  refreshMs?: number;
}) {
  const [statsByEvent, setStatsByEvent] = useState<StatsByEvent>(initialStatsByEvent);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number>(Date.now());

  const inflightRef = useRef<AbortController | null>(null);

  const refresh = async (reason: string) => {
    if (inflightRef.current) return;

    setLoading(true);
    setErr(null);

    const ac = new AbortController();
    inflightRef.current = ac;

    try {
      const r = await fetch("/api/organizador/dashboard", {
        method: "GET",
        cache: "no-store",
        signal: ac.signal,
      });

      const json = await r.json().catch(() => null);

      if (!r.ok || !json?.ok) {
        throw new Error(json?.error || `Dashboard refresh falló (${r.status})`);
      }

      setStatsByEvent(json.statsByEvent ?? {});
      setLastSyncAt(Date.now());
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setErr(String(e?.message || e) + ` (reason=${reason})`);
      }
    } finally {
      inflightRef.current = null;
      setLoading(false);
    }
  };

  useEffect(() => {
    const onFocus = () => refresh("focus");
    const onVis = () => {
      if (document.visibilityState === "visible") refresh("visible");
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refresh("interval");
    }, refreshMs);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
      inflightRef.current?.abort();
      inflightRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let bc: BroadcastChannel | null = null;

    try {
      bc = new BroadcastChannel("tc-dashboard");
      bc.onmessage = (ev) => {
        if (ev?.data?.type === "refresh") refresh("broadcast");
      };
    } catch {}

    return () => {
      try {
        bc?.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastSyncLabel = useMemo(() => msAgoLabel(Date.now() - lastSyncAt), [lastSyncAt]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Organizador</h1>
          <p className="text-sm text-white/70">
            Stats reales + pagos + scanner + check-ins.
          </p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
            <span>
              Última sync: <span className="text-white/70">{lastSyncLabel}</span>
            </span>
            <span className="text-white/20">•</span>
            <span>Auto: {Math.round(refreshMs / 1000)}s (solo visible)</span>
            {loading ? (
              <>
                <span className="text-white/20">•</span>
                <span className="text-white/70">Actualizando…</span>
              </>
            ) : null}
          </div>

          {err ? (
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-white/80">
              {err}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refresh("manual")}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
          >
            Refrescar
          </button>

          <Link
            href="/eventos"
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
          >
            Ver vista pública
          </Link>

          <Link
            href="/organizador/pagos"
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
          >
            Dashboard pagos
          </Link>

          <form action="/api/organizador/logout" method="POST">
            <button
              type="submit"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
            >
              Cerrar sesión
            </button>
          </form>

          <ResetDemoButton />
        </div>
      </header>

      {/* Eventos */}
      <section className={glassCard + " p-6"}>
        <h2 className="text-lg font-semibold">Tus eventos</h2>
        <p className="mt-1 text-sm text-white/60">Selecciona un evento y abre el scanner.</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {EVENTS.map((e) => {
            const s: DashboardStats | undefined = statsByEvent[e.id];

            const sold = s?.totals.sold ?? 0;
            const pending = s?.totals.pending ?? 0;
            const used = s?.totals.used ?? 0;
            const held = s?.totals.held ?? 0;
            const remaining = s?.totals.remaining ?? 0;
            const capacity = s?.totals.capacity ?? 0;

            const soldPct = percent(sold, capacity);

            return (
              <div key={e.id} className={glassCard + " p-5"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-white/50">
                      {e.city} • {e.venue}
                    </p>
                    <p className="mt-2 text-lg font-semibold">{e.title}</p>
                    <p className="mt-1 text-sm text-white/70">{formatDateLong(e.dateISO)}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge label="Vendidos" value={sold} />
                      <Badge label="Pendientes" value={pending} />
                      <Badge label="Check-ins" value={used} />
                      <span className={pillBase}>
                        <span className="text-white/60">% vendido</span>
                        <span className="font-semibold text-white">{soldPct}%</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-white/50">Desde</p>
                    <p className="text-lg font-semibold">${formatCLP(eventPriceFrom(e))}</p>
                    <p className="mt-1 text-[11px] text-white/40">ID: {e.id}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
                  <StatCard label="Vendidos" value={sold} />
                  <StatCard label="Pendientes" value={pending} />
                  <StatCard label="Check-ins" value={used} />
                  <StatCard label="Disponibles" value={remaining} />
                  <StatCard label="En hold" value={held} />
                  <StatCard label="Capacidad" value={capacity} />
                </div>

                <details className={"mt-4 " + glassSoft + " p-4"}>
                  <summary className="cursor-pointer text-sm text-white/80">
                    Ver breakdown por tipo
                  </summary>

                  <div className="mt-3 space-y-2 text-sm">
                    {(s?.byType ?? []).map((x) => (
                      <div
                        key={x.ticketTypeId}
                        className={glassSoft + " flex flex-wrap items-center justify-between gap-2 px-3 py-2"}
                      >
                        <span className="text-white/80">{x.ticketTypeName}</span>

                        <span className="text-white/60">
                          {x.remaining <= 0 ? (
                            <span className="text-white">Agotado</span>
                          ) : (
                            <>Quedan {x.remaining}</>
                          )}{" "}
                          <span className="text-white/30">•</span> vendidos {x.sold}{" "}
                          <span className="text-white/30">•</span> pendientes {x.pending}{" "}
                          <span className="text-white/30">•</span> usados {x.used}
                        </span>
                      </div>
                    ))}
                  </div>

                  {(s?.recentUsed?.length ?? 0) > 0 ? (
                    <>
                      <p className="mt-4 text-xs text-white/50">Últimos check-ins</p>
                      <div className="mt-2 space-y-2 text-xs">
                        {(s?.recentUsed ?? []).map((u) => (
                          <div
                            key={u.ticketId}
                            className={glassSoft + " flex flex-wrap items-center justify-between gap-2 px-3 py-2"}
                          >
                            <span className="text-white/70">{u.ticketTypeName}</span>
                            <span className="text-white/50">{u.buyerEmail}</span>
                            <span className="text-white/40">{u.usedAtISO}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </details>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/organizador/eventos/${e.id}/scanner`}
                    className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                  >
                    Abrir scanner
                  </Link>

                  <Link
                    href={`/eventos/${e.slug}`}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
                  >
                    Ver evento público
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
