import Link from "next/link";
import { cookies } from "next/headers";
import { formatCLP, formatDateLong } from "@/lib/events";
import type { DashboardStats } from "@/lib/organizer.pg.server";
import {
  getOrganizerDashboardStatsPgServerByOrganizer,
  listOrganizerEventsPgServer,
  type OrganizerEvent,
} from "@/lib/organizer.pg.server";
import { getOrganizerFromSession } from "@/lib/organizer-auth.pg.server";

type SearchParams = Record<string, string | string[] | undefined>;
type PayFilter = "ALL" | "OPEN" | "PAID" | "FAILED";

const shellCard =
  "rounded-xl border border-black/10 bg-white shadow-[0_12px_30px_rgba(0,0,0,0.25)]";
const innerCard = "rounded-lg border border-black/10 bg-white";
const chip =
  "inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/70";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={`${innerCard} p-3`}>
      <p className="text-[11px] text-black/50">{label}</p>
      <p className="mt-1 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: number | string }) {
  return (
    <span className={chip}>
      <span className="text-black/45">{label}</span>
      <span className="font-semibold text-black">{value}</span>
    </span>
  );
}

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

function PayFilterPill({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-white/20 bg-white text-black"
          : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default async function OrganizadorUI({ searchParams }: { searchParams?: SearchParams }) {
  const ck = await cookies();

  const sid =
    ck.get("tc_org_sess")?.value ??
    ck.get("organizer_session")?.value ??
    ck.get("tc_org_session")?.value ??
    null;

  const organizer = sid ? await getOrganizerFromSession(sid) : null;
  const organizerId = organizer?.id ?? null;

  if (!organizerId) {
    return (
      <div className={`${shellCard} p-6`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-black">Sesión de organizador no válida</p>
            <p className="mt-1 text-sm text-black/60">
              Tu sesión no existe en DB (o expiró). Vuelve a iniciar sesión.
            </p>
          </div>
          <StatusPill status="INVALID" />
        </div>

        <div className="mt-4">
          <Link
            href="/organizador/login?reason=no_session"
            className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
          >
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const events: OrganizerEvent[] = await listOrganizerEventsPgServer(organizerId);
  const statsByEvent = await getOrganizerDashboardStatsPgServerByOrganizer(organizerId);

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
      {/* Header del contenido */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Organizador</h1>
          <p className="text-sm text-white/65">Tus eventos (por cuenta) + pagos + scanner.</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-white/45">Filtro pagos:</span>
            <PayFilterPill active={payFilter === "ALL"} href={hrefAll} label="Todos" />
            <PayFilterPill active={payFilter === "OPEN"} href={hrefOpen} label="Open" />
            <PayFilterPill active={payFilter === "PAID"} href={hrefPaid} label="Paid" />
            <PayFilterPill active={payFilter === "FAILED"} href={hrefFailed} label="Fallidos" />
            <span className="text-xs text-white/35">({payFilterLabel})</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/organizador/eventos/nuevo"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
          >
            Crear evento
          </Link>

          <form action="/organizador/logout" method="GET">
            <button
              type="submit"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>

      {/* Tus eventos */}
      <section className={`${shellCard} p-6`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-black">Tus eventos</h2>
            <p className="mt-1 text-sm text-black/60">Resumen por evento + acceso rápido al scanner.</p>
          </div>
          <div className="text-xs text-black/50">
            {events.length ? `${events.length} evento(s)` : "Sin eventos"}
          </div>
        </div>

        {events.length === 0 ? (
          <div className="mt-5 rounded-lg border border-black/10 bg-white p-4 text-sm text-black/70">
            Todavía no tienes eventos asignados (organizer_events).
            <div className="mt-3">
              <Link
                href="/organizador/eventos/nuevo"
                className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
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
                <div key={e.id} className="rounded-xl border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-black/50">
                        {e.city} • {e.venue}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-black">{e.title}</p>
                      <p className="mt-1 text-sm text-black/60">{formatDateLong(e.dateISO)}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge label="Emitidos" value={issued} />
                        <Badge label="Pendientes" value={pending} />
                        <Badge label="Check-ins" value={used} />
                        <Badge label="% vendido" value={`${soldPct}%`} />
                        <Badge label="% check-in" value={`${checkinPct}%`} />
                        <Badge label="Pagos PAID" value={paidPay} />
                        <Badge label="Pagos open" value={openPay} />
                        <Badge label="Fallidos" value={failedPay} />
                        <Badge label="Recaudado" value={`$${formatCLP(revenue)}`} />

                        {mismatch ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-amber-600/20 bg-amber-50 px-3 py-1 text-xs text-amber-900">
                            <span className="text-amber-900/70">⚠️ counters</span>
                            <span className="font-semibold">
                              sold={soldCounter} vs emitidos={issued}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-black/50">Desde</p>
                      <p className="text-lg font-semibold text-black">${formatCLP(e.priceFromClp)}</p>
                      <p className="mt-1 text-[11px] text-black/40">ID: {e.id}</p>
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
        )}
      </section>
    </div>
  );
}