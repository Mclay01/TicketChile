import Link from "next/link";
export default function Footer() {
  return <footer className="footer"><div className="container"><div className="footer-grid"><div className="stack-sm"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true" />TicketChile</Link><p className="muted">Tu próxima experiencia empieza aquí.<br />Entradas para eventos en Chile.</p></div>
    <nav aria-label="Explorar"><p className="eyebrow">Explorar</p><Link href="/eventos">Cartelera</Link><Link href="/mis-tickets">Mis tickets</Link><Link href="/simulador">TicketChile AI</Link></nav>
    <nav aria-label="Ayuda"><p className="eyebrow">Ayuda</p><Link href="/ayuda">Preguntas frecuentes</Link><Link href="/contacto">Contacto</Link><Link href="/organizador">Organizadores</Link></nav>
    <nav aria-label="Legal"><p className="eyebrow">Información legal</p><Link href="/legal/terminos">Términos</Link><Link href="/legal/privacidad">Privacidad</Link><Link href="/legal/reembolsos">Reembolsos</Link></nav></div>
    <div className="footer-bottom between"><span>© {new Date().getFullYear()} TicketChile</span><span className="mono">CLP · CHILE</span></div></div></footer>;
}
