"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
export function Logout() { return <button className="btn secondary" onClick={() => signOut({ callbackUrl: "/" })}>Cerrar sesión</button>; }
export default function AccountNav() {
  const path = usePathname();
  return <nav className="account-nav" aria-label="Mi cuenta">{[["/cuenta", "Mi perfil"], ["/mis-tickets", "Mis tickets"], ["/cuenta/compras", "Mis compras"], ["/security?kind=BUYER", "Seguridad"]].map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}</nav>;
}
