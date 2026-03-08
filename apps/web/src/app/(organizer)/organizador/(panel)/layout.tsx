import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizerFromSession } from "@/lib/organizer-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginUrl(from: string, reason: string) {
  const sp = new URLSearchParams();
  if (from) sp.set("from", from);
  if (reason) sp.set("reason", reason);
  return `/organizador/login?${sp.toString()}`;
}

export default async function OrganizerPanelLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();

  const ck = await cookies();
  const sid = ck.get("tc_org_sess")?.value?.trim() || "";
  const from = "/organizador";

  if (!sid || sid.length < 10) redirect(loginUrl(from, "missing"));

  const org = await getOrganizerFromSession(sid);

  if (!org) {
    redirect(`/organizador/logout?from=${encodeURIComponent(from)}&reason=invalid`);
  }

  if (!org.verified) redirect(loginUrl(from, "unverified"));
  if (!org.approved) redirect(loginUrl(from, "pending"));

  return (
    <div className="min-h-screen text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/organizador" className="flex items-center gap-3">
              <Image
                src="/brand/ticketchile-logo.png"
                alt="Ticketchile"
                width={180}
                height={48}
                priority
                className="h-9 w-auto"
              />
            </Link>

            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              Panel Organizador
            </span>
          </div>

          <nav className="flex items-center gap-3">
            <Link
              href="/organizador/soporte"
              className="text-sm text-white/70 hover:text-white"
            >
              Soporte
            </Link>

            <Link
              href="/organizador/eventos/nuevo"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Crear Evento
            </Link>

            <form action="/organizador/logout" method="GET">
              <button type="submit" className="text-sm font-medium text-red-400 hover:text-red-300">
                Salir
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-8">{children}</main>

      <footer className="border-t border-white/10 bg-black/10">
        <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-white/50 md:px-8">
          <span suppressHydrationWarning>© {year} Ticketchile</span>
        </div>
      </footer>
    </div>
  );
}