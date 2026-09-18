import Link from "next/link";
import { catalogDb, discoveryFacets } from "@/lib/events.server";
import { EventCard, EventHero } from "@/components/tc/events";
import { EmptyState, Notice } from "@/components/tc/ui";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const data = await Promise.all([catalogDb(), discoveryFacets()]).catch(() => null);
  const events = data?.[0].events || [], facets = data?.[1];
  return <div style={{ paddingBottom: 64 }}>{events[0] ? <EventHero event={events[0]} /> : <section className="page stack"><p className="eyebrow">TicketChile · Vive el próximo encuentro</p><h1>Hay algo que se vive<br />solo estando ahí.</h1><p className="muted">Descubre la cartelera y encuentra tu próxima experiencia.</p>{!data ? <Notice error>No pudimos cargar los eventos. Intenta nuevamente en unos momentos.</Notice> : <EmptyState title="La próxima cartelera está en camino">Vuelve pronto para descubrir nuevos eventos.</EmptyState>}</section>}
    {!!facets?.categories.length && <nav className="categories" aria-label="Categorías">{facets.categories.map(c => <Link className="category-chip" key={c.slug} href={`/categorias/${c.slug}`}>{c.name}<span>{c.count}</span></Link>)}</nav>}
    {!!events.length && <section className="section"><div className="between section-head"><h2>Próximos encuentros</h2><Link className="eyebrow" href="/eventos">Ver cartelera →</Link></div><div className="event-grid">{events.slice(0, 8).map(event => <EventCard key={event.id} event={event} />)}</div></section>}
    {!!facets?.cities.length && <section className="section"><h2>Por ciudad</h2><nav className="categories" aria-label="Ciudades">{facets.cities.slice(0, 8).map(c => <Link className="category-chip" key={c.city} href={`/eventos?city=${encodeURIComponent(c.city)}`}>{c.city}<span>{c.count}</span></Link>)}</nav></section>}
    <section className="ai-entry"><div className="stack"><p className="eyebrow">Para organizadores · TicketChile AI</p><h2>Todo gran evento empieza con una idea.</h2><p className="muted">Un espacio para dar forma a tu próximo encuentro. Estamos preparando el asistente de creación.</p></div><div className="stack" style={{ alignContent: "center" }}><p className="muted">Conoce el espacio de planificación o entra al panel para gestionar tus eventos.</p><div className="row"><Link className="btn secondary" href="/simulador">Explorar el simulador →</Link><Link href="/organizador">Panel organizador</Link></div></div></section>
  </div>;
}
