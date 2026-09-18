import Link from "next/link";
import { buyerPurchases } from "@/lib/account.server";
import { catalogFilters, dateLabel, type SearchValues } from "@/lib/discovery";
import { EmptyState, PageHeading, Status } from "@/components/tc/ui";
import { formatCLP } from "@/lib/events";
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const page = catalogFilters(await searchParams).page;
  const { purchases, hasMore } = await buyerPurchases(page);
  return <><PageHeading eyebrow="Mi cuenta" title="Mis compras">El historial de tus órdenes en TicketChile.</PageHeading>{purchases.length ? purchases.map(p => <article className="history-row" key={p.id}><div className="stack-sm"><h3>{p.event_title}</h3><p className="hint mono" style={{ overflowWrap: "anywhere" }}>Orden {p.id}</p><p className="hint">{dateLabel(p.created_at)}</p></div><div><Status value={p.fulfillment_status === "REVIEW" ? "REVIEW" : p.status || "REVIEW"} /></div><p className="mono">{p.amount_clp === null ? "Por confirmar" : `$${formatCLP(p.amount_clp)} CLP`}</p></article>) : <EmptyState title="Aún no tienes compras" href="/eventos">Tus órdenes aparecerán aquí cuando completes una compra.</EmptyState>}<nav className="pagination" aria-label="Paginación de compras">{page > 1 && <Link className="btn secondary" href={`/cuenta/compras?page=${page - 1}`}>Anterior</Link>}{hasMore && <Link className="btn secondary" href={`/cuenta/compras?page=${page + 1}`}>Siguiente</Link>}</nav></>;
}
