import Link from "next/link";

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header interno */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/organizador" className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">Ticketchile</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
              Panel organizador
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/organizador/eventos/nuevo"
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Crear evento
            </Link>

            <form action="/api/organizador/logout" method="POST">
              <button
                type="submit"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Salir
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-white/60">
          <span suppressHydrationWarning>© {year} Ticketchile — organizer</span>
        </div>
      </footer>
    </div>
  );
}