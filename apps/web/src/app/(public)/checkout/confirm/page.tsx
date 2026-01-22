import { Suspense } from "react";
import CheckoutConfirmClient from "./ui";

export const dynamic = "force-dynamic";

export default function CheckoutConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-white/80">Cargando…</p>
        </div>
      }
    >
      <CheckoutConfirmClient />
    </Suspense>
  );
}
