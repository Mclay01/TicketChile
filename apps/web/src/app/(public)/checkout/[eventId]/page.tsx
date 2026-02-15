import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventById } from "@/lib/events";
import CheckoutBuyerForm from "@/components/CheckoutBuyerForm";

type Props = {
  params: Promise<{ eventId: string }>;
};

function formatDateOnly(dateISO: string) {
  const d = new Date(dateISO);
  return d.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTimeOnly(dateISO: string) {
  const d = new Date(dateISO);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

export default async function CheckoutPage({ params }: Props) {
  const { eventId } = await params;

  // ✅ getEventById ahora es async -> necesitas await
  const event = await getEventById(eventId);
  if (!event) return notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/eventos/${event.slug}`}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
      >
        ← Volver al evento
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
          <p className="mt-1 text-sm text-white/70">{event.title}</p>
        </div>

        <div className="text-xs text-white/60">
          {formatDateOnly(event.dateISO)} · {formatTimeOnly(event.dateISO)}
        </div>
      </div>

      {/* SOLO comprador + total + pagar */}
      <CheckoutBuyerForm event={event} />
    </div>
  );
}
