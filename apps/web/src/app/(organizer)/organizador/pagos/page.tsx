// apps/web/src/app/(organizer)/organizador/pagos/page.tsx
import Link from "next/link";
import { EVENTS, formatCLP } from "@/lib/events";
import { getPaymentsDashboardPgServer } from "@/lib/organizer.pg.server";
import PaymentsTableClient from "./PaymentsTableClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function pickInt(v: unknown, fallback: number) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const s = String(v);
    if (!s) continue;
    sp.set(k, s);
  }
  const out = sp.toString();
  return out ? `?${out}` : "";
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
      <span className="text-white/40">{label}</span>
      <span className="font-semibold text-white/80">{value}</span>
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
      <p className="text-[11px] text-white/50">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export default async function OrganizadorPagosPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const eventId = pickString(searchParams.eventId);
  const status = pickString(searchParams.status).toUpperCase() || "ALL";
  const q = pickString(searchParams.q);

  const limit = Math.min(200, Math.max(10, pickInt(searchParams.limit, 50)));
  const page = Math.max(1, pickInt(searchParams.page, 1));
  const offset = (page - 1) * limit;

  const data = await getPaymentsDashboardPgServer({
    eventId,
    status,
    q,
    limit,
    offset,
  });

  const totalPages = Math.max(1, Math.ceil(data.total / limit));
  const from = data.total === 0 ? 0 : offset + 1;
  const to = Math.min(data.total, offset + data.rows.length);

  const baseParams = { eventId, status, q, limit };

  const hasFilters = !!eventId || status !== "ALL" || !!q;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard pagos</h1>

          <p className="text-sm text-white/70">
            {data.total > 0 ? (
              <>
                Mostrando <span className="text-white">{from}-{to}</span> de{" "}
                <span className="text-white">{data.total}</span>
              </>
            ) : (
              <>No hay pagos con esos filtros.</>
            )}
          </p>

          {/* Chips resumen filtros */}
          {hasFilters ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {eventId ? <Chip label="eventId" value={eventId} /> : null}
              {status ? <Chip label="status" value={status} /> : null}
              {q ? <Chip label="q" value={q} /> : null}
              <Chip label="limit" value={String(limit)} />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              <Chip label="status" value="ALL" />
              <Chip label="limit" value={String(limit)} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/organizador"
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10"
          >
            ← Volver
          </Link>
        </div>
      </header>

      {/* Filtros */}
      <section className="rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white/90">Filtros</h2>
            <p className="mt-1 text-sm text-white/60">
              Filtra por evento, estado o texto (email, nombre, ids).
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-white/60">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              Tip: “cs_…” = session de Stripe
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              “pay_…” = paymentId interno
            </span>
          </div>
        </div>

        <form method="GET" className="mt-5 grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-4">
            <label className="text-xs text-white/60">Evento</label>
            <select
              name="eventId"
              defaultValue={eventId}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            >
              <option value="">Todos</option>
              {EVENTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({e.id})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-white/60">Estado</label>
            <select
              name="status"
              defaultValue={status}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            >
              <option value="ALL">ALL</option>
              <option value="PAID">PAID</option>
              <option value="PENDING">PENDING</option>
              <option value="CREATED">CREATED</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="text-xs text-white/60">Buscar</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="email, nombre, pay_..., cs_..., hold_..., order..."
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none placeholder:text-white/40"
            />
          </div>

          <div className="md:col-span-1">
            <input type="hidden" name="limit" value={String(limit)} />
            <input type="hidden" name="page" value="1" />
            <button
              type="submit"
              className="w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Filtrar
            </button>
          </div>
        </form>
      </section>

      {/* Totales */}
      <section className="grid gap-3 md:grid-cols-8">
        <StatCard label="PAID" value={data.totals.paid} />
        <StatCard label="PENDING" value={data.totals.pending} />
        <StatCard label="CREATED" value={data.totals.created} />
        <StatCard label="FAILED" value={data.totals.failed} />
        <StatCard label="CANCELLED" value={data.totals.cancelled} />
        <StatCard label="Otros" value={data.totals.other} />
        <StatCard label="Recaudado (PAID)" value={`$${formatCLP(data.totals.amountPaidClp)}`} />
        <StatCard
          label="Monto Open (CREATED+PENDING)"
          value={`$${formatCLP(data.totals.amountOpenClp)}`}
        />
      </section>

      {/* Tabla */}
      <PaymentsTableClient rows={data.rows} />

      {/* Paginación */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/60">
          Página <span className="text-white">{page}</span> de{" "}
          <span className="text-white">{totalPages}</span>
        </p>

        <div className="flex gap-2">
          <Link
            aria-disabled={page <= 1}
            className={[
              "rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10",
              page <= 1 ? "pointer-events-none opacity-50" : "",
            ].join(" ")}
            href={`/organizador/pagos${qs({ ...baseParams, page: page - 1 })}`}
          >
            ← Anterior
          </Link>

          <Link
            aria-disabled={page >= totalPages}
            className={[
              "rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm backdrop-blur hover:bg-white/10",
              page >= totalPages ? "pointer-events-none opacity-50" : "",
            ].join(" ")}
            href={`/organizador/pagos${qs({ ...baseParams, page: page + 1 })}`}
          >
            Siguiente →
          </Link>
        </div>
      </div>
    </div>
  );
}
