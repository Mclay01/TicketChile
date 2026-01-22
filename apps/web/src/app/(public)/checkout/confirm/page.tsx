// apps/web/src/app/checkout/confirm/page.tsx
import { Suspense } from "react";
import CheckoutConfirmClient from "./ui";

export const dynamic = "force-dynamic"; // evita que Next intente prerender estático

export default function CheckoutConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Confirmando tu compra…
            </h1>
            <p className="text-sm text-white/60">
              Estamos validando el pago. Esto puede tomar unos segundos.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-white/80">Cargando…</p>
          </div>
        </div>
      }
    >
      <CheckoutConfirmClient />
    </Suspense>
  );
}
