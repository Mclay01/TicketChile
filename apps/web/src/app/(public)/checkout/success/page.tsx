// apps/web/src/app/(public)/checkout/success/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function firstParam(sp: SP, key: string) {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function CheckoutSuccessPage(props: {
  searchParams: Promise<SP> | SP;
}) {
  const sp = await Promise.resolve(props.searchParams);

  const paymentId = pickString(firstParam(sp, "payment_id"));
  const sessionId = pickString(firstParam(sp, "session_id")); // legacy

  if (paymentId) {
    redirect(`/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}`);
  }

  // Si alguien te pegó un link viejo de Stripe…
  if (sessionId) {
    // Si todavía tienes confirm legacy por session_id, podrías redirigir:
    // redirect(`/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`);
    // Pero como tu confirm ya soporta session_id como fallback, lo redirigimos igual:
    redirect(`/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`);
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-2xl font-semibold tracking-tight">No hay datos para confirmar</h1>
          <p className="mt-2 text-sm text-white/70">
            Falta <span className="text-white/90 font-semibold">payment_id</span> en la URL, así que no puedo validar el pago.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/eventos"
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Volver a eventos
            </Link>
            <Link
              href="/mis-tickets"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Ir a Mis tickets
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
