import Link from "next/link";
import { Notice, PageHeading } from "@/components/tc/ui";
export default function ContactPage() {
  const address = process.env.SUPPORT_EMAIL?.trim();
  const usable = address && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(address);
  return <div className="page prose stack"><PageHeading eyebrow="Ayuda TicketChile" title="Conversemos">Si necesitas ayuda con una compra, ten a mano el folio de tu orden.</PageHeading>{usable ? <a className="btn secondary" href={`mailto:${address}`}>Escribir a soporte</a> : <Notice>El canal de contacto está pendiente de habilitación. Por ahora puedes consultar las respuestas de ayuda y revisar tus compras desde tu cuenta.</Notice>}<p className="muted">Nunca compartas contraseñas, códigos de recuperación ni datos completos de tu tarjeta.</p><div className="row"><Link href="/ayuda">Preguntas frecuentes →</Link><Link href="/cuenta/compras">Mis compras →</Link></div></div>;
}
