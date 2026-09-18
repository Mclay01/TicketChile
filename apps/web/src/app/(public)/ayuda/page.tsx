import Link from "next/link";
import { PageHeading } from "@/components/tc/ui";
const questions = [
  ["¿Dónde encuentro mis entradas?", "Ingresa con la cuenta que usaste al comprar y abre Mis tickets. Las entradas pertenecen a esa cuenta; el correo de contacto de la compra puede ser diferente."],
  ["¿Cómo ingreso al evento?", "Abre el detalle de tu entrada y presenta el QR. Debe estar disponible y sin uso. El equipo del evento valida el acceso."],
  ["¿Qué hago si no aparece mi compra?", "Revisa el estado de la confirmación y el historial de compras de tu cuenta. Si el pago está pendiente o en revisión, la emisión puede no haberse completado. No repitas un pago sin revisar su estado."],
  ["¿Puedo transferir una entrada?", "La transferencia todavía no está habilitada. No compartas el QR como sustituto de una transferencia."],
  ["¿Puedo pedir un reembolso?", "La política definitiva de reembolsos aún está pendiente de aprobación. Consulta la información del evento y la sección de reembolsos; no damos por confirmadas condiciones del prototipo."],
  ["¿Cómo recupero mi acceso?", "Usa Recuperar acceso en la página de ingreso. Si corresponde, recibirás instrucciones para establecer una contraseña nueva."],
];
export default function HelpPage() { return <div className="page prose"><PageHeading eyebrow="Centro de ayuda" title="Estamos para orientarte">Respuestas para que disfrutes tu próximo encuentro.</PageHeading>{questions.map(([q, a]) => <details className="faq" key={q}><summary>{q}</summary><p>{a}</p></details>)}<div className="section row"><Link className="btn secondary" href="/contacto">Necesito más ayuda</Link><Link href="/mis-tickets">Ver mis tickets →</Link></div></div>; }
