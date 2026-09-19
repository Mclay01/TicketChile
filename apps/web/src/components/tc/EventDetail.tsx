import Link from "next/link";
import type { Event } from "@/lib/events";
import Media from "@/components/tc/Media";
import { EventMetadata } from "@/components/tc/events";
import EventTicketSelector from "@/components/EventTicketSelector";
import { Notice } from "@/components/tc/ui";
export default function EventDetail({event,preview=false}:{event:Event;preview?:boolean}) {
  const past = event.ended;
  return <div className="page"><Link className="hint" href="/eventos">← Volver a la cartelera</Link><section className="detail-hero"><Media src={event.hero?.desktop || event.image} mobileSrc={event.hero?.mobile} alt={event.title} priority sizes="(max-width: 800px) 100vw, 55vw" /><div className="stack"><p className="eyebrow">{event.categoryName || "Evento"} · {event.city}</p><h1>{event.title}</h1><EventMetadata event={event} /><a className="btn" href="#tickets">Ver entradas →</a></div></section>
    <div className="detail-columns"><section className="stack"><h2>El encuentro</h2><p className="description">{event.description}</p><hr className="divider" /><div><p className="eyebrow">Organiza</p><h3>{event.organizerName || "Información del organizador pendiente"}</h3></div><Link href="/ayuda">¿Necesitas ayuda con tu entrada? →</Link></section>
      <aside id="tickets" className="selection">{past ? <Notice>Este evento ya finalizó. No hay entradas a la venta.</Notice> : <EventTicketSelector key={event.id} event={event} preview={preview} />}</aside></div>
    {(event.agePolicy||event.accessInfo||event.faq)&&<section className="stack" style={{marginTop:32}}><h2>Antes de asistir</h2>{event.agePolicy&&<p>{event.agePolicy}</p>}{event.accessInfo&&<p className="description">{event.accessInfo}</p>}{event.faq&&<><h3>Información adicional</h3><p className="description">{event.faq}</p></>}</section>}
  </div>;
}
