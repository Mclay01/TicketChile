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

function Card({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 backdrop-blur-xl">
      {(title || right) ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          {title ? <h2 className="text-lg font-semibold text-white">{title}</h2> : <div />}
          {right ? <div className="flex items-center gap-2">{right}</div> : null}
        </div>
      ) : null}
      <div className="p-6">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
  dot = "green",
}: {
  label: string;
  value: string;
  sub?: string;
  dot?: "green" | "gray";
}) {
  const dotCls = dot === "green" ? "bg-emerald-400" : "bg-white/20";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-widest text-white/50">{label.toUpperCase()}</p>
        <span className={`h-2 w-2 rounded-full ${dotCls}`} />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      {sub ? <p className="mt-2 text-sm text-white/50">{sub}</p> : null}
    </div>
  );
}

function SoftBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
    >
      {children}
    </Link>
  );
}

function PrimaryBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
    >
      {children}
    </Link>
  );
}

function PayFilterPill({ active, href, label }: { active: boolean; href: string; label: string }) {
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

  const sid =
    ck.get("tc_org_sess")?.value ??
    ck.get("organizer_session")?.value ??
    ck.get("tc_org_session")?.value ??
    null;

  const organizer = sid ? await getOrganizerFromSession(sid) : null;
  const organizerId = organizer?.id ?? null;

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
  const statsByEvent = await getOrganizerDashboardStatsPgServerByOrganizer(organizerId);

  // ===== KPIs (sumatorias) =====
  let totalRevenue = 0;
  let totalIssued = 0;
  let totalUsed = 0;

  for (const ev of events) {
    const s: DashboardStats | undefined = statsByEvent[ev.id];
    if (!s) continue;

    const pending = s?.totals?.pending ?? 0;
    const used = s?.totals?.used ?? 0;
    totalIssued += pending + used;
    totalUsed += used;

    const rev = s?.payments?.totals?.amountPaidClp ?? 0;
    totalRevenue += rev;
  }

  const payFilter = normalizePayFilter(pickOne(searchParams, "pay"));
  const baseHref = "/organizador";
  const hrefAll = `${baseHref}`;
  const hrefOpen = `${baseHref}?pay=open`;
  const hrefPaid = `${baseHref}?pay=paid`;
  const hrefFailed = `${baseHref}?pay=failed`;

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-white">Resumen General</h1>
          <p className="text-white/55">Bienvenido de nuevo, organizador de Ticketchile.</p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs text-white/40">Filtro pagos:</span>
            <PayFilterPill active={payFilter === "ALL"} href={hrefAll} label="Todos" />
            <PayFilterPill active={payFilter === "OPEN"} href={hrefOpen} label="Open" />
            <PayFilterPill active={payFilter === "PAID"} href={hrefPaid} label="Paid" />
            <PayFilterPill active={payFilter === "FAILED"} href={hrefFailed} label="Fallidos" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SoftBtn href="/organizador/pagos">Descargar Reportes</SoftBtn>
          <PrimaryBtn href="/organizador/eventos/nuevo">Crear Evento</PrimaryBtn>
        </div>
      </header>

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Ventas Totales"
          value={`$${formatCLP(totalRevenue)}`}
          sub="Recaudado (PAID)"
          dot="green"
        />
        <KpiCard
          label="Tickets Vendidos"
          value={String(totalIssued)}
          sub={events.length ? `${percent(totalIssued, Math.max(totalIssued, 1))}% del total` : ""}
          dot="green"
        />
        <KpiCard
          label="Eventos Activos"
          value={String(events.length)}
          sub={events.length ? `${Math.min(3, events.length)} próximos` : "Sin eventos"}
          dot={events.length ? "gray" : "gray"}
        />
        <KpiCard
          label="Check-ins"
          value={String(totalUsed)}
          sub="Hoy"
          dot="green"
        />
      </div>

      {/* Events */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Eventos Activos</h2>
        <Link href="/organizador" className="text-sm text-white/60 hover:text-white">
          Ver todos los eventos
        </Link>
      </div>

      <div className="space-y-4">
        {events.length === 0 ? (
          <Card title="Tus eventos">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              Todavía no tienes eventos asignados (organizer_events).
              <div className="mt-3">
                <PrimaryBtn href="/organizador/eventos/nuevo">Crear evento</PrimaryBtn>
              </div>
            </div>
          </Card>
        ) : (
          events.map((e) => {
            const s: DashboardStats | undefined = statsByEvent[e.id];

            const capacity = s?.totals.capacity ?? 0;
            const held = s?.totals.held ?? 0;
            const pending = s?.totals.pending ?? 0;
            const used = s?.totals.used ?? 0;

            const issued = pending + used;
            const remainingReal = Math.max(capacity - issued - held, 0);
            const occ = percent(issued, capacity);

            const stateLabel =
              occ >= 95 ? "Por agotar" : remainingReal <= 0 ? "Agotado" : "Activo";

            const stateCls =
              occ >= 95
                ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                : remainingReal <= 0
                ? "border-red-500/20 bg-red-500/10 text-red-200"
                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";

            return (
              <div
                key={e.id}
                className="rounded-3xl border border-white/10 bg-black/25 p-8 backdrop-blur-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-6">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-semibold text-white">{e.title}</h3>
                      <span className={`rounded-full border px-3 py-1 text-xs ${stateCls}`}>
                        {stateLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 text-sm text-white/55">
                      <span className="inline-flex items-center gap-2">
                        <span className="text-white/35">📅</span>
                        {formatDateLong(e.dateISO)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="text-white/35">🎟️</span>
                        <span className="text-white/80 font-semibold">{issued}</span>
                        <span className="text-white/35">/</span>
                        {capacity} tickets vendidos
                      </span>
                    </div>

                    <div className="pt-2">
                      <p className="text-xs font-semibold tracking-widest text-white/35">
                        OCUPACIÓN
                      </p>
                      <div className="mt-2 flex items-center gap-4">
                        <div className="h-2 w-full max-w-xl rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full bg-blue-500/80"
                            style={{ width: `${Math.min(100, Math.max(0, occ))}%` }}
                          />
                        </div>
                        <div className="text-sm font-semibold text-blue-300">{occ}%</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <PrimaryBtn href={`/organizador/eventos/${e.id}/scanner`}>Abrir Scanner</PrimaryBtn>

                    {/* No invento ruta "Gestionar". Si después la creas, cambias el href. */}
                    <button
                      type="button"
                      disabled
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/50"
                      title="Aún no implementado"
                    >
                      Gestionar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}