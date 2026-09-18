import type { Event } from "@/lib/events";
// Explicit legacy development fixtures, never public catalog data.
export const EVENTS: Event[] = [
  {
    id: "evt_001",
    slug: "fiesta-verano",
    title: "Fiesta Verano",
    city: "Santiago",
    venue: "Ubicación por confirmar",
    dateISO: "2026-01-15T01:00:00-03:00",
    image: "/events/fiesta-verano.jpg",
    hero: {
      desktop: "/banners/1400x450/fiesta-verano.jpg",
      mobile: "/banners/800x400/fiesta-verano.jpg",
    },
    description: `DJ – Tragos – Música.

Acceso por QR. +18. Cupos limitados.`,
    ticketTypes: [{ id: "tt_general", name: "Entrada", priceCLP: 5500, maxPerOrder: 10 }],
  },
  {
    id: "evt_002",
    slug: "sunset-party",
    title: "La Frida — Sunset Party",
    city: "Santiago",
    venue: "Disco Bar La Frida",
    dateISO: "2026-04-22T17:00:00-03:00",
    image: "/events/sunset-party.jpg",
    hero: {
      desktop: "/banners/1400x450/sunset-party.jpg",
      mobile: "/banners/800x400/sunset-party.jpg",
    },
    description: `Sunset + after party.

Acceso por QR. +18. Producción completa.`,
    ticketTypes: [
      { id: "tt_preventa", name: "Preventa", priceCLP: 10000, maxPerOrder: 10 },
      { id: "tt_general", name: "General", priceCLP: 12000, maxPerOrder: 10 },
    ],
  },
  {
    id: "evt_003",
    slug: "noche-rock",
    title: "Noche de Rock",
    city: "Santiago",
    venue: "Calle Cualquiera 123",
    dateISO: "2026-06-20T21:00:00-03:00",
    image: "/events/noche-rock.jpg",
    hero: {
      desktop: "/banners/1400x450/noche-rock.jpg",
      mobile: "/banners/800x400/noche-rock.jpg",
    },
    description: `Bandas en vivo + energía de la buena.

Acceso por QR. +18.`,
    ticketTypes: [{ id: "tt_general", name: "Entrada General", priceCLP: 12000, maxPerOrder: 10 }],
  },
];
