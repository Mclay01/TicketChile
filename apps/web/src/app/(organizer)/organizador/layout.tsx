import SiteHeader from "@/components/public/SiteHeader";

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen text-white">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-white/60">
          <span suppressHydrationWarning>© {year} Ticketchile — organizer</span>
        </div>
      </footer>
    </div>
  );
}
