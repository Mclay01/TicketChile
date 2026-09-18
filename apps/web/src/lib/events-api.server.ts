import type { Event } from "@/lib/events";
/** Legacy wire names, backed by the same publication boundary as the pages. */
export function eventWire(event: Event) {
  return { ...event, date_iso: event.dateISO, ticket_types: event.ticketTypes.map(t => ({ id: t.id, name: t.name, price_clp: t.priceCLP, max_per_order: t.maxPerOrder, capacity: t.capacity, sold: t.sold, held: t.held })) };
}
