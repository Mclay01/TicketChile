import Link from "next/link";
import type { Event } from "@/lib/events";
import { eventPriceFrom, eventIsSoldOut, formatCLP } from "@/lib/events";
import { dateLabel } from "@/lib/discovery";
import Media from "./Media";
export function Price({ amount }: { amount: number }) { return <span className="price">${formatCLP(amount)} <small style={{ fontSize: 11 }}>CLP</small></span>; }
export function EventCard({ event }: { event: Event }) {
  return <Link href={`/eventos/${event.slug}`} className="event-card"><Media src={event.image} alt={event.title} /><p className="eyebrow">{event.categoryName || "En cartelera"}</p><h3>{event.title}</h3><p className="muted">{event.venue}</p><div className="card-bottom"><span>{dateLabel(event.dateISO)} · {event.city}</span><span>{!event.ticketTypes.length ? "Entradas por confirmar" : eventIsSoldOut(event) ? "Agotado" : `Desde $${formatCLP(eventPriceFrom(event))}`}</span></div></Link>;
}
export function EventMetadata({ event }: { event: Event }) {
  return <dl className="metadata"><div><dt>Fecha y hora</dt><dd className="mono">{dateLabel(event.dateISO, true)}</dd></div><div><dt>Recinto</dt><dd>{event.venue}</dd><dd className="muted">{event.city}</dd></div></dl>;
}
export function EventHero({ event }: { event: Event }) {
  return <section className="hero" aria-label="Próximo evento"><div className="hero-image"><Media src={event.hero?.desktop || event.image} mobileSrc={event.hero?.mobile} alt={event.title} priority sizes="(max-width: 800px) 100vw, 70vw" /><div className="hero-caption"><p className="eyebrow">En cartelera · {event.categoryName || "Evento"}</p><h1>{event.title}</h1><p>{event.description.slice(0, 160)}</p></div></div><aside className="ticket-stub"><p className="eyebrow">TicketChile · Entradas</p><EventMetadata event={event} /><hr className="perforation" /><div className="stack-sm"><p className="muted">Desde</p>{event.ticketTypes.length ? <Price amount={eventPriceFrom(event)} /> : <p>Entradas por confirmar</p>}<Link className="btn" href={`/eventos/${event.slug}#tickets`}>Ver entradas →</Link><Link className="hint" href={`/eventos/${event.slug}`}>Detalle del evento</Link></div><p className="eyebrow">Acceso con tu entrada QR</p></aside></section>;
}
