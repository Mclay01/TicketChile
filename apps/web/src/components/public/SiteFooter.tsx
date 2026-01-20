export default function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground md:px-6">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Ticketchile</p>
          <p className="text-xs">
            Pagos seguros con Stripe (y sí, ya sé: falta el modo “se ve caro” 😄)
          </p>
        </div>
      </div>
    </footer>
  );
}
