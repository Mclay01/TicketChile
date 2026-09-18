import Link from "next/link";
import { notFound } from "next/navigation";
import { buyerTicket, walletAvailable } from "@/lib/account.server";
import { dateLabel } from "@/lib/discovery";
import { Notice, PageHeading, Status } from "@/components/tc/ui";
import TicketQr from "@/components/tc/TicketQr";
import ResendTicket from "@/components/tc/ResendTicket";
import Media from "@/components/tc/Media";
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ticket = await buyerTicket((await params).id);
  if (!ticket) notFound();
  const usable = ticket.status === "VALID";
  return <div className="stack"><Link className="hint" href="/mis-tickets">← Mis tickets</Link><PageHeading title="Tu entrada" eyebrow="TicketChile · Acceso personal" /><article className="ticket-detail"><div><Media src={ticket.image} alt={ticket.title} sizes="(max-width: 800px) 100vw, 400px" className="ticket-cover" /><div className="panel stack"><Status value={ticket.status} /><h2>{ticket.title}</h2><p className="mono">{dateLabel(ticket.date_iso, true)}</p><p>{ticket.venue} · {ticket.city}</p><hr className="perforation" /><dl className="metadata"><div><dt>Tipo de entrada</dt><dd>{ticket.ticket_type_name}</dd></div><div><dt>Cuenta titular</dt><dd style={{ overflowWrap: "anywhere" }}>{ticket.owner_email}</dd></div><div><dt>Folio</dt><dd className="mono hint" style={{ overflowWrap: "anywhere" }}>{ticket.id}</dd></div></dl></div></div><div className="ticket-qr">{usable ? <><TicketQr id={ticket.id} /><p className="hint">Presenta este QR en el acceso.<br />No compartas una captura de tu entrada.</p>{walletAvailable() && <a className="btn secondary" href={`/api/wallet/google/save-url?ticketId=${encodeURIComponent(ticket.id)}`}>Agregar a Google Wallet</a>}</> : <Notice>Esta entrada {ticket.status === "USED" ? "ya fue utilizada" : "está anulada"}. El QR no está disponible.</Notice>}{usable && <ResendTicket id={ticket.id} />}<button className="btn secondary" disabled>Transferencia no disponible</button><p className="hint">La transferencia de entradas aún no está habilitada.</p></div></article></div>;
}
