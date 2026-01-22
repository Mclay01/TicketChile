import HomeHeroCarousel from "@/components/HomeHeroCarousel";
import EventosFilters from "@/components/EventosFiltersSuspense";
import EventCard from "@/components/EventCard";
import { EVENTS } from "@/lib/events";

export default function HomePage() {
  const cities = Array.from(new Set(EVENTS.map((e) => e.city))).sort((a, b) =>
    a.localeCompare(b, "es")
  );

  const featured = [...EVENTS]
    .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
    .slice(0, 6);

  const gridEvents = [...EVENTS]
    .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
    .slice(0, 9);

  return (
    // ✅ Sin background acá: usamos SOLO el fondo global
    <div className="space-y-10">
      {/* ✅ Banner grande arriba (sube para ocupar el espacio donde antes iba el texto) */}
      <div className="-mt-6 md:-mt-8">
        <HomeHeroCarousel events={featured} />
      </div>

      {/* ✅ Buscador = mismo componente que /eventos */}
      <section className="glass-card rounded-3xl p-4 md:p-5">
        <EventosFilters cities={cities} />
      </section>

      {/* Grid con las MISMAS tarjetas que /eventos */}
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
