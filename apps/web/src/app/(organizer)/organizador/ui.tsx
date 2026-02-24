import Link from "next/link";
import { cookies } from "next/headers";
import { formatCLP, formatDateLong } from "@/lib/events";
import type { DashboardStats } from "@/lib/organizer.pg.server";
import {
  getOrganizerDashboardStatsPgServer,
  listOrganizerEventsPgServer,
  type OrganizerEvent,
} from "@/lib/organizer.pg.server";
import { verifyOrganizerIdCookieValue } from "@/lib/organizerAuth.server";

type SearchParams = Record<string, string | string[] | undefined>;
type PayFilter = "ALL" | "OPEN" | "PAID" | "FAILED";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <p className="text-xs text-white/60">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
      <span className="text-white/60">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </span>
  );
}

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
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      {s || "UNKNOWN"}
    </span>
  );
}

function percent(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function pickOne(sp?: SearchParams, key?: string) {
  if (!sp || !key) return "";
  const v = sp[key];
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

function normalizePayFilter(raw: string): PayFilter {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "open") return "OPEN";
  if (s === "paid") return "PAID";
  if (s === "failed") return "FAILED";
  return "ALL";
}

function PayFilterPill({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1 text-xs transition backdrop-blur",
        active
          ? "border-white/20 bg-white/15 text-white"
          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default async function OrganizadorUI({ searchParams }: { searchParams?: SearchParams }) {
  const ck = await cookies();
  const rawOrg = ck.get("tc_org_user")?.value ?? null;
  const organizerId = verifyOrganizerIdCookieValue(rawOrg);

  if (!organizerId) {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
        Sesión de organizador no válida.
        <div className="mt-3">
          <Link
            href="/organizador/login?reason=no_session"
            className="inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
          >
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const events: OrganizerEvent[] = await listOrganizerEventsPgServer(organizerId);
  const statsByEvent = await getOrganizerDashboardStatsPgServer(organizerId);

  const payFilter = normalizePayFilter(pickOne(searchParams, "pay"));
  const payFilterLabel =
    payFilter === "OPEN"
      ? "Open (CREATED+PENDING)"
      : payFilter === "PAID"
      ? "PAID"
      : payFilter === "FAILED"
      ? "Fallidos"
      : "Todos";

  const baseHref = "/organizador";
  const hrefAll = `${baseHref}`;
  const hrefOpen = `${baseHref}?pay=open`;
  const hrefPaid = `${baseHref}?pay=paid`;
  const hrefFailed = `${baseHref}?pay=failed`;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Organizador</h1>
          <p className="text-sm text-white/70">Tus eventos (por cuenta) + pagos + scanner.</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-white/50">Filtro pagos:</span>
            <PayFilterPill active={payFilter === "ALL"} href={hrefAll} label="Todos" />
            <PayFilterPill active={payFilter === "OPEN"} href={hrefOpen} label="Open" />
            <PayFilterPill active={payFilter === "PAID"} href={hrefPaid} label="Paid" />
            <PayFilterPill active={payFilter === "FAILED"} href={hrefFailed} label="Fallidos" />
            <span className="text-xs text-white/40">({payFilterLabel})</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/organizador/eventos/nuevo"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
          >
            Crear evento
          </Link>

          <form action="/api/organizador/logout" method="POST">
            <button
              type="submit"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h2 className="text-lg font-semibold">Tus eventos</h2>

        {events.length === 0 ? (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            Todavía no tienes eventos asignados (organizer_events).
            <div className="mt-3">
              <Link
                href="/organizador/eventos/nuevo"
                className="inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
                Crear evento (queda en revisión)
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {events.map((e) => {
              const s: DashboardStats | undefined = statsByEvent[e.id];

              const capacity = s?.totals.capacity ?? 0;
              const held = s?.totals.held ?? 0;

              const pending = s?.totals.pending ?? 0;
              const used = s?.totals.used ?? 0;
              const issued = pending + used;

              const remainingReal = Math.max(capacity - issued - held, 0);

              const soldCounter = s?.totals.sold ?? 0;
              const mismatch = soldCounter !== issued;

              const soldPct = percent(issued, capacity);
              const checkinPct = percent(used, issued);

              const p = s?.payments;
              const paidPay = p?.totals.paid ?? 0;
              const createdPay = p?.totals.created ?? 0;
              const pendingPay = p?.totals.pending ?? 0;
              const openPay = createdPay + pendingPay;

              const failedPay =
                (p?.totals.failed ?? 0) +
                (p?.totals.cancelled ?? 0) +
                (p?.totals.other ?? 0);

              const revenue = p?.totals.amountPaidClp ?? 0;

              return (
                <div
                  key={e.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-white/50">
                        {e.city} • {e.venue}
                      </p>
                      <p className="mt-2 text-lg font-semibold">{e.title}</p>
                      <p className="mt-1 text-sm text-white/70">{formatDateLong(e.dateISO)}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge label="Emitidos" value={issued} />
                        <Badge label="Pendientes" value={pending} />
                        <Badge label="Check-ins" value={used} />
                        <Badge label="% vendido" value={`${soldPct}%`} />
                        <Badge label="% check-in" value={`${checkinPct}%`} />
                        <Badge label="Pagos PAID" value={paidPay} />
                        <Badge label="Pagos open" value={openPay} />
                        <Badge label="Recaudado" value={`$${formatCLP(revenue)}`} />

                        {mismatch ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
                            <span className="text-amber-200/80">⚠️ counters</span>
                            <span className="font-semibold">
                              sold={soldCounter} vs emitidos={issued}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-white/50">Desde</p>
                      <p className="text-lg font-semibold">${formatCLP(e.priceFromClp)}</p>
                      <p className="mt-1 text-[11px] text-white/40">ID: {e.id}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
                    <StatCard label="Emitidos (VALID+USED)" value={issued} />
                    <StatCard label="Pendientes (VALID)" value={pending} />
                    <StatCard label="Check-ins (USED)" value={used} />
                    <StatCard label="Disponibles (real)" value={remainingReal} />
                    <StatCard label="En hold" value={held} />
                    <StatCard label="Capacidad" value={capacity} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/organizador/eventos/${e.id}/scanner`}
                      className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                    >
                      Abrir scanner
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}