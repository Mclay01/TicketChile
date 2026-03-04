"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EVENTS, eventPriceFrom, formatCLP, formatDateLong } from "@/lib/events";
import type { DashboardStats } from "@/lib/organizer.pg.server";
import ResetDemoButton from "./ResetDemoButton";

type StatsByEvent = Record<string, DashboardStats>;

const shellCard =
  "rounded-xl border border-black/10 bg-white shadow-[0_12px_30px_rgba(0,0,0,0.20)]";
const innerCard = "rounded-lg border border-black/10 bg-white";
const chip =
  "inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/70";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={innerCard + " p-3"}>
      <p className="text-[11px] text-black/50">{label}</p>
      <p className="mt-1 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: number }) {
  return (
    <span className={chip}>
      <span className="text-black/45">{label}</span>
      <span className="font-semibold text-black">{value}</span>
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Organizador</h1>
          <p className="text-sm text-white/65">Stats reales + pagos + scanner + check-ins.</p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
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
            <div className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-white/85">
              {err}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refresh("manual")}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            Refrescar
          </button>

          <Link
            href="/eventos"
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            Ver vista pública
          </Link>

          <Link
            href="/organizador/pagos"
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            Dashboard pagos
          </Link>

          <form action="/organizador/logout" method="GET">
            <button
              type="submit"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10"
            >
              Cerrar sesión
            </button>
          </form>

          <ResetDemoButton />
        </div>
      </header>

      <section className={shellCard + " p-6"}>
        <h2 className="text-lg font-semibold text-black">Tus eventos</h2>
        <p className="mt-1 text-sm text-black/60">Selecciona un evento y abre el scanner.</p>

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
              <div key={e.id} className={shellCard + " p-5"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-black/50">
                      {e.city} • {e.venue}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-black">{e.title}</p>
                    <p className="mt-1 text-sm text-black/60">{formatDateLong(e.dateISO)}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge label="Vendidos" value={sold} />
                      <Badge label="Pendientes" value={pending} />
                      <Badge label="Check-ins" value={used} />
                      <span className={chip}>
                        <span className="text-black/45">% vendido</span>
                        <span className="font-semibold text-black">{soldPct}%</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-black/50">Desde</p>
                    <p className="text-lg font-semibold text-black">${formatCLP(eventPriceFrom(e))}</p>
                    <p className="mt-1 text-[11px] text-black/40">ID: {e.id}</p>
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

                <details className="mt-4 rounded-lg border border-black/10 bg-white p-4">
                  <summary className="cursor-pointer text-sm text-black/80">
                    Ver breakdown por tipo
                  </summary>

                  <div className="mt-3 space-y-2 text-sm">
                    {(s?.byType ?? []).map((x) => (
                      <div
                        key={x.ticketTypeId}
                        className="rounded-lg border border-black/10 bg-white px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-black/85">{x.ticketTypeName}</span>

                          <span className="text-black/55">
                            {x.remaining <= 0 ? (
                              <span className="text-black">Agotado</span>
                            ) : (
                              <>Quedan {x.remaining}</>
                            )}{" "}
                            <span className="text-black/25">•</span> vendidos {x.sold}{" "}
                            <span className="text-black/25">•</span> pendientes {x.pending}{" "}
                            <span className="text-black/25">•</span> usados {x.used}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(s?.recentUsed?.length ?? 0) > 0 ? (
                    <>
                      <p className="mt-4 text-xs text-black/50">Últimos check-ins</p>
                      <div className="mt-2 space-y-2 text-xs">
                        {(s?.recentUsed ?? []).map((u) => (
                          <div
                            key={u.ticketId}
                            className="rounded-lg border border-black/10 bg-white px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-black/75">{u.ticketTypeName}</span>
                              <span className="text-black/55">{u.buyerEmail}</span>
                              <span className="text-black/40">{u.usedAtISO}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </details>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/organizador/eventos/${e.id}/scanner`}
                    className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
                  >
                    Abrir scanner
                  </Link>

                  <Link
                    href={`/eventos/${e.slug}`}
                    className="inline-flex items-center justify-center rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-black/5"
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