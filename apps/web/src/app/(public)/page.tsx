import HeroBanner from "@/components/HeroBanner";
import EventosFilters from "@/components/EventosFilters";
import EventCard from "@/components/EventCard";
import { EVENTS } from "@/lib/events";

export default function HomePage() {
  const cities = Array.from(new Set(EVENTS.map((e) => e.city))).sort((a, b) =>
    a.localeCompare(b, "es")
  );

  const gridEvents = [...EVENTS]
    .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
    .slice(0, 9);

  return (
    <div className="space-y-10">
      {/* ✅ HERO full-bleed + responsive (desktop/móvil) */}
      <HeroBanner
        href="/eventos" // o a un evento específico: `/eventos/${EVENTS[0].slug}`
        desktopSrc="/events/hero-1400x450.jpg"
        mobileSrc="/events/hero-800x400.jpg"
        alt="Banner principal de eventos"
      />

      {/* Buscador */}
      <section className="glass-card rounded-3xl p-4 md:p-5">
        <EventosFilters cities={cities} />
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
  );
}
