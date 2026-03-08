import EventosFilters from "@/components/EventosFilters";
import EventCard from "@/components/EventCard";
import HomeHeroRotator from "@/components/HomeHeroRotator";
import { EVENTS } from "@/lib/events";
import { Suspense } from "react";

export default function HomePage() {
  const cities = Array.from(new Set(EVENTS.map((e) => e.city))).sort((a, b) =>
    a.localeCompare(b, "es")
  );

  const sortedEvents = [...EVENTS].sort(
    (a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
  );

  const gridEvents = sortedEvents.slice(0, 9);

  const heroItems = sortedEvents.slice(0, 5).map((event) => ({
    href: `/eventos/${event.slug}`,
    desktopSrc: event?.hero?.desktop ?? "/banners/1400x450/fiesta-verano.jpg",
    mobileSrc: event?.hero?.mobile ?? "/banners/800x400/fiesta-verano.jpg",
    alt: `Banner: ${event.title}`,
  }));

  return (
    <div className="space-y-8">
      <HomeHeroRotator items={heroItems} intervalMs={4000} />

      <div className="space-y-8 pt-6">
        <section className="glass-card rounded-3xl p-4 md:p-5">
          <Suspense fallback={<div className="text-sm text-white/60">Cargando filtros…</div>}>
            <EventosFilters cities={cities} />
          </Suspense>
        </section>

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