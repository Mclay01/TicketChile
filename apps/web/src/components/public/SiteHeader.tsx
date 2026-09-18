"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Menu, Search, UserRound } from "lucide-react";
import { Dialog } from "@/components/tc/interactive";
export default function SiteHeader() {
  const { data, status } = useSession();
  const loggedIn = status === "authenticated" && Boolean(data?.user?.email);
  return <header className="site-header"><div className="container header-row"><Link href="/" className="brand" aria-label="TicketChile, inicio"><span className="brand-mark" aria-hidden="true" />TicketChile</Link>
    <nav className="header-nav" aria-label="Principal"><Link href="/eventos">Cartelera</Link><Link href="/simulador">TicketChile AI</Link></nav>
    <div className="header-actions"><form action="/eventos" className="search-box header-search" role="search"><Search size={18} aria-hidden="true" /><input name="q" maxLength={120} aria-label="Buscar eventos" placeholder="Evento, recinto o ciudad" /></form><Link className="desktop-only" href="/organizador">Crear evento</Link><Link className="desktop-only btn secondary" href={loggedIn ? "/mis-tickets" : "/signin"}>{loggedIn ? "Mis tickets" : "Ingresar"}</Link><Link className="icon-btn mobile-only" href={loggedIn ? "/cuenta" : "/signin"} aria-label={loggedIn ? "Mi cuenta" : "Ingresar"}><UserRound size={20} /></Link>
      <Dialog label={<Menu size={20} />} title="Explorar TicketChile"><nav className="stack" aria-label="Navegación móvil"><form action="/eventos" className="search-box" role="search"><Search size={18} /><input name="q" maxLength={120} aria-label="Buscar eventos" placeholder="Evento, recinto o ciudad" /></form><Link href="/eventos">Cartelera</Link><Link href="/mis-tickets">Mis tickets</Link><Link href="/cuenta">Mi cuenta</Link><Link href="/simulador">TicketChile AI</Link><Link href="/organizador">Crear evento</Link><Link href="/ayuda">Ayuda</Link></nav></Dialog>
    </div></div></header>;
}
