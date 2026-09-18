import Link from "next/link";
import { Search } from "lucide-react";
import { catalogDb, discoveryFacets } from "@/lib/events.server";
import { catalogUrl, type SearchValues } from "@/lib/discovery";
import { EventCard } from "./events";
import { EmptyState, Field, PageHeading } from "./ui";
export default async function Catalog({ input = {}, category }: { input?: SearchValues; category?: string }) {
  const [{ events, total, filters }, facets] = await Promise.all([catalogDb({ ...input, ...(category ? { category } : {}) }), discoveryFacets()]);
  const categoryName = facets.categories.find(c => c.slug === category)?.name;
  return <div className="page"><PageHeading eyebrow="Explora TicketChile" title={categoryName || (filters.q ? `Resultados para “${filters.q}”` : "Encuentra tu próximo plan")}>Música, cultura y encuentros que se viven en persona.</PageHeading>
    <form action={category ? `/categorias/${category}` : "/eventos"} className="stack-sm"><div className="search-box"><Search size={18} aria-hidden="true" /><input name="q" aria-label="Buscar evento, recinto o ciudad" placeholder="Busca un evento, recinto o ciudad" defaultValue={filters.q} maxLength={120} /></div>
      <details className="filter-content" open><summary className="filter-toggle btn secondary">Filtros y orden</summary><div className="catalog-filter">
        <Field label="Ciudad"><select name="city" defaultValue={filters.city}><option value="">Todas las ciudades</option>{facets.cities.map(c => <option key={c.city}>{c.city}</option>)}</select></Field>
        {!category && <Field label="Categoría"><select name="category" defaultValue={filters.category}><option value="">Todas las categorías</option>{facets.categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></Field>}
        <Field label="Fecha"><select name="when" defaultValue={filters.when}><option value="upcoming">Próximos eventos</option><option value="week">Próximos 7 días</option></select></Field>
        <Field label="Ordenar por"><select name="sort" defaultValue={filters.sort}><option value="date">Fecha más cercana</option><option value="price_asc">Menor precio</option><option value="price_desc">Mayor precio</option></select></Field><button className="btn">Buscar</button>
      </div></details></form>
    <div className="between section-head" style={{ marginTop: 28 }}><p className="eyebrow">{total} {total === 1 ? "evento" : "eventos"}</p><Link className="hint" href={category ? `/categorias/${category}` : "/eventos"}>Limpiar filtros</Link></div>
    {events.length ? <div className="event-grid">{events.map(event => <EventCard key={event.id} event={event} />)}</div> : <EmptyState title="No encontramos eventos">Prueba otra fecha, ciudad o búsqueda.</EmptyState>}
    {total > 12 && <nav className="pagination" aria-label="Paginación">{filters.page > 1 && <Link className="btn secondary" href={catalogUrl({ ...filters, page: filters.page - 1 })}>Anterior</Link>}<span className="mono">Página {filters.page} · {Math.max(1, Math.ceil(total / 12))}</span>{filters.page * 12 < total && <Link className="btn secondary" href={catalogUrl({ ...filters, page: filters.page + 1 })}>Siguiente</Link>}</nav>}
  </div>;
}
