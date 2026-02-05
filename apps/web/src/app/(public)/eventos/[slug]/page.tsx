import Link from "next/link";
import { notFound } from "next/navigation";
import { EVENTS, formatDateLong } from "@/lib/events";
import EventTicketSelector from "@/components/EventTicketSelector";
import HeroBanner from "@/components/HeroBanner";

type Props = { params: Promise<{ slug: string }> };

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

export default async function EventoDetallePage({ params }: Props) {
  const { slug } = await params;

  const event = EVENTS.find((e) => e.slug === slug);
  if (!event) return notFound();

  // ✅ banners reales por evento
  const desktopSrc =
    event.hero?.desktop ?? "/banners/1400x450/fiesta-verano.jpg";
  const mobileSrc =
    event.hero?.mobile ?? "/banners/800x400/fiesta-verano.jpg";

  return (
    <div className="bg-transparent text-white">
      {/* ✅ HERO full-bleed pegado al header */}
      <HeroBanner
        href={undefined}
        desktopSrc={desktopSrc}
        mobileSrc={mobileSrc}
        alt={`Banner del evento ${event.title}`}
        fullBleed
        priority
        height={{ base: 230, md: 360, lg: 420 }}
      />

      {/* ✅ Contenido centrado (ya lo centra el layout con max-w + px) */}
      <div className="space-y-6 py-10">
        {/* Back */}
        <div>
          <Link
            href="/eventos"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-black/30 hover:text-white"
          >
            ← Volver a eventos
          </Link>
        </div>

        {/* Info principal */}
        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(0,0,0,0.55),rgba(255,255,255,0.06))] shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="p-6 md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs text-white/90 ring-1 ring-white/10">
                {event.city}
              </span>
              <span className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs text-white ring-1 ring-[color:var(--accent-soft-2)]">
                {formatDateOnly(event.dateISO)}
              </span>
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs text-white/90 ring-1 ring-white/10">
                {formatTimeOnly(event.dateISO)}
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
              {event.title}
            </h1>

            <div className="mt-3 space-y-1 text-sm text-white/85">
              <p>
                <span className="text-white/70">Lugar:</span>{" "}
                <span className="font-semibold">{event.venue}</span>
              </p>
              <p className="text-white/75">{event.city}</p>
              <p className="text-sm text-white/70">
                {formatDateLong(event.dateISO)} • {event.venue} • {event.city}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="#tickets"
                className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
              >
                Comprar tickets
              </a>
              <a
                href="#info"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
              >
                Ver info
              </a>
            </div>
          </div>
        </section>

        {/* 2 columnas */}
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section
            id="info"
            className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.35))] p-6 md:p-7 shadow-[0_25px_70px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold tracking-widest text-white/85">
                INFORMACIÓN COMPLETA DEL EVENTO
              </p>
              <span className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-[11px] text-white ring-1 ring-[color:var(--accent-soft-2)]">
                Importante
              </span>
            </div>

            <div className="mt-4 space-y-4 text-sm leading-6 text-white/80">
              <p className="whitespace-pre-wrap">{event.description}</p>

              <p className="text-xs text-white/55">
                {formatDateLong(event.dateISO)} • {event.venue} • {event.city}
              </p>
            </div>
          </section>

          <aside id="tickets" className="lg:sticky lg:top-20 h-fit scroll-mt-24">
            <EventTicketSelector event={event} />
          </aside>
        </div>
      </div>
    </div>
  );
}
