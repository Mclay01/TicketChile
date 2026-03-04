// apps/web/src/app/(organizer)/organizador/(auth)/layout.tsx
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function OrganizerAuthLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white">
      {/* Top bar minimal */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0F14]/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/eventos" className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">Ticketchile</span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
              Organizador
            </span>
          </Link>

          <nav className="flex items-center gap-2 text-sm text-white/70">
            <Link className="hover:text-white" href="/organizador/login">
              Login
            </Link>
            <span className="text-white/20">•</span>
            <Link className="hover:text-white" href="/organizador/registro">
              Registro
            </Link>
          </nav>
        </div>
      </header>

      <main className="px-4 py-10">{children}</main>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-white/60">
          <span suppressHydrationWarning>© {year} Ticketchile — organizer</span>
        </div>
      </footer>
    </div>
  );
}