import SiteHeader from "@/components/public/SiteHeader";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen text-white overflow-x-hidden">
      <SiteHeader />

      {/* ✅ SIN padding-top global (pt-0). El spacing lo maneja cada página */}
      <main className="mx-auto w-full max-w-6xl px-6 pt-0 pb-10">
        {children}
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-white/60">
          <span suppressHydrationWarning>© {year} Ticketchile</span>
        </div>
      </footer>
    </div>
  );
}
