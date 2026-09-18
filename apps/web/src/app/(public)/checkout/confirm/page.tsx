import { getBuyerEmail } from "@/lib/buyer-guard.server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CheckoutConfirmClient from "./ui";

export const dynamic = "force-dynamic";

export default async function CheckoutConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!await getBuyerEmail()) {
    const params = await searchParams;
    const query = new URLSearchParams();
    for (const key of ["payment_id", "session_id", "flow_token"]) {
      if (typeof params[key] === "string") query.set(key, params[key]);
    }
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/checkout/confirm?${query}`)}`);
  }
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
