import Link from "next/link";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import type { Event } from "@/lib/events";
import { eventIsSoldOut, eventPriceFrom, formatCLP, formatDateShort } from "@/lib/events";

export default function EventCard({ event }: { event: Event }) {
  const soldOut = eventIsSoldOut(event);
  const from = eventPriceFrom(event);

  const img =
    (event as any).image ||
    "https://images.pexels.com/photos/1763075/pexels-photo-1763075.jpeg?auto=compress&cs=tinysrgb&w=1400";

  return (
    <Link
      href={`/eventos/${event.slug}`}
      className={[
        "group block overflow-hidden rounded-[28px]",
        "border border-white/10 bg-white/[0.04] backdrop-blur-2xl",
        "shadow-[0_22px_70px_rgba(0,0,0,0.45)]",
        "transition-all duration-300 hover:-translate-y-1",
        "hover:border-[rgba(239,68,68,0.20)]",
        "hover:shadow-[0_0_0_1px_rgba(239,68,68,0.22),0_35px_90px_rgba(0,0,0,0.55)]",
      ].join(" ")}
    >
      {/* Poster */}
      <div className="p-3">
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/10 aspect-[3/4]">
          <Image
            src={img}
            alt={event.title}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />

          {/* Oscurecido base para legibilidad */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

          {/* ✅ Hover rojo más LEVE (como tu screenshot) */}
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-t from-[rgba(239,68,68,0.22)] via-[rgba(239,68,68,0.06)] to-transparent" />

          {/* Chips */}
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[rgba(239,68,68,0.95)]" />
              {event.city.toUpperCase()}
            </span>

            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
              <span className="opacity-80">📅</span>
              {formatDateShort(event.dateISO).toUpperCase()}
            </span>
          </div>

          {soldOut ? (
            <div className="absolute right-3 top-3">
              <span className="rounded-full bg-[rgba(239,68,68,0.95)] px-3 py-1 text-[11px] font-extrabold text-white shadow-[0_12px_30px_rgba(239,68,68,0.25)]">
                AGOTADO
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Info */}
      <div className="px-5 pb-5 pt-1">
        {/* ✅ Tipografía + hover rojo */}
        <h3 className="line-clamp-2 text-[18px] font-extrabold tracking-tight text-white/95 transition-colors duration-200 group-hover:text-[rgb(239,68,68)]">
          {event.title}
        </h3>

        <div className="mt-2 flex items-center gap-2 text-[13px] text-white/55">
          <MapPin className="h-4 w-4 opacity-70" />
          <span className="truncate">{event.venue}</span>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-white/35">
              DESDE
            </p>
            <p className="mt-1 text-[28px] font-extrabold tracking-tight text-white">
              ${formatCLP(from)}
            </p>
          </div>

          {/* ✅ Botón exactamente tipo pill con flecha */}
          {soldOut ? (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white/50">
              Agotado
            </span>
          ) : (
            <span className="inline-flex items-center gap-3 rounded-full bg-[rgb(239,68,68)] px-6 py-3 text-sm font-extrabold text-white shadow-[0_18px_40px_rgba(239,68,68,0.22)] transition hover:brightness-95">
              Comprar
              <span className="grid h-7 w-7 place-items-center rounded-full bg-black/15">
                <ArrowRight className="h-4 w-4" />
              </span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
