import Link from "next/link";
import { buyerTickets } from "@/lib/account.server";
import { catalogFilters, dateLabel, type SearchValues } from "@/lib/discovery";
import { EmptyState, PageHeading, Status } from "@/components/tc/ui";
import Media from "@/components/tc/Media";
export default async function TicketsPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const params = await searchParams, page = catalogFilters(params).page;
  const view = typeof params.view === "string" && ["past", "cancelled"].includes(params.view) ? params.view : "upcoming";
  const { tickets, hasMore } = await buyerTickets(view, page);
  return <><PageHeading eyebrow="Mi cuenta" title="Mis tickets">Tus próximos encuentros, siempre a mano.</PageHeading><nav className="tabs" aria-label="Estado de las entradas">{[["upcoming", "Próximos"], ["past", "Pasados"], ["cancelled", "Anulados"]].map(([key, name]) => <Link key={key} href={`/mis-tickets?view=${key}`} aria-current={view === key ? "page" : undefined}>{name}</Link>)}</nav><div className="stack">{tickets.length ? tickets.map(t => <article className="owned-ticket" key={t.id}><Media src={t.image} alt={t.title} sizes="160px" /><div className="owned-ticket-info"><Status value={t.status} /><h3>{t.title}</h3><p className="hint mono">{dateLabel(t.date_iso, true)}</p><p className="hint">{t.venue} · {t.city}</p><p>{t.ticket_type_name}</p></div><div className="owned-ticket-action"><Link className="btn secondary" href={`/mis-tickets/${t.id}`}>Ver entrada →</Link></div></article>) : <EmptyState title={view === "upcoming" ? "Tu próximo encuentro te espera" : "No hay entradas en esta sección"} href="/eventos">Explora la cartelera y encuentra tu próximo plan.</EmptyState>}</div><nav className="pagination" aria-label="Paginación de entradas">{page > 1 && <Link className="btn secondary" href={`/mis-tickets?view=${view}&page=${page - 1}`}>Anterior</Link>}{hasMore && <Link className="btn secondary" href={`/mis-tickets?view=${view}&page=${page + 1}`}>Siguiente</Link>}</nav></>;
}
