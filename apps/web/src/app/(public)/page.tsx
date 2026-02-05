import HeroBanner from "@/components/HeroBanner";
import EventosFilters from "@/components/EventosFilters";
import EventCard from "@/components/EventCard";
import { EVENTS } from "@/lib/events";
import { Suspense } from "react";

export default function HomePage() {
  const cities = Array.from(new Set(EVENTS.map((e) => e.city))).sort((a, b) =>
    a.localeCompare(b, "es")
  );

  const gridEvents = [...EVENTS]
    .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
    .slice(0, 9);

  const heroEvent = gridEvents[0] ?? EVENTS[0];

  const desktopSrc = heroEvent?.hero?.desktop ?? "/banners/1400x450/fiesta-verano.jpg";
  const mobileSrc = heroEvent?.hero?.mobile ?? "/banners/800x400/fiesta-verano.jpg";

  return (
    <div className="space-y-8">
      {/* ✅ HERO pegado al header, full-bleed real */}
      <HeroBanner
        href={heroEvent ? `/eventos/${heroEvent.slug}` : "/eventos"}
        desktopSrc={desktopSrc}
        mobileSrc={mobileSrc}
        alt={heroEvent ? `Banner: ${heroEvent.title}` : "Banner principal de eventos"}
        fullBleed
        priority
        height={{ base: 230, md: 360, lg: 420 }}
      />

      {/* ✅ El spacing ahora vive acá (no en el layout) */}
      <div className="space-y-8 pt-6">
        {/* Buscador */}
        <section className="glass-card rounded-3xl p-4 md:p-5">
          <Suspense fallback={<div className="text-sm text-white/60">Cargando filtros…</div>}>
            <EventosFilters cities={cities} />
          </Suspense>
        </section>

        {/* Grid */}
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-white/50">Eventos</p>
              <h2 className="text-lg font-semibold text-white">Explora lo que viene</h2>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {gridEvents.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
