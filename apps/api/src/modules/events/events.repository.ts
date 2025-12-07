import { prisma } from '../../core/db/client';
import type { CreateEventInput } from './events.schemas';

export async function createEventWithTicketTypes(
  organizerId: string,
  data: CreateEventInput
) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        organizerId,
        title: data.title,
        description: data.description,
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        startDateTime: new Date(data.startDateTime),
        endDateTime: new Date(data.endDateTime),
        totalCapacity: data.totalCapacity,
        status: 'PUBLISHED' // MVP: lo dejamos publicado de inmediato
      }
    });

    const ticketTypesData = data.ticketTypes.map((tt) => ({
      eventId: event.id,
      name: tt.name,
      description: tt.description,
      priceCents: tt.priceCents,
      currency: tt.currency,
      capacity: tt.capacity,
      perUserLimit: tt.perUserLimit ?? null,
      salesStartDateTime: tt.salesStartDateTime
        ? new Date(tt.salesStartDateTime)
        : null,
      salesEndDateTime: tt.salesEndDateTime
        ? new Date(tt.salesEndDateTime)
        : null
    }));

    await tx.ticketType.createMany({
      data: ticketTypesData
    });

    return tx.event.findUnique({
      where: { id: event.id },
      include: {
        ticketTypes: true
      }
    });
  });
}

export async function findPublishedEvents() {
  return prisma.event.findMany({
    where: {
      status: 'PUBLISHED'
    },
    include: {
      ticketTypes: true,
      organizer: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      startDateTime: 'asc'
    }
  });
}


export async function findEventById(eventId: string) {
  return prisma.event.findUnique({
    where: { id: eventId },
  });
}

export async function countOrdersForEvent(eventId: string) {
  return prisma.order.count({
    where: { eventId },
  });
}

// Cantidad de tickets emitidos para el evento
export async function countTicketsForEvent(eventId: string) {
  return prisma.ticket.count({
    where: { eventId },
  });
}

// ¿Quedan tickets NO usados para este evento?
export async function countNotUsedTicketsForEvent(eventId: string) {
  return prisma.ticket.count({
    where: {
      eventId,
      status: {
        not: 'USED',
      },
    },
  });
}

// Hard delete: borra ticketTypes + event
export async function deleteEventById(eventId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.ticketType.deleteMany({
      where: { eventId },
    });

    const deleted = await tx.event.delete({
      where: { id: eventId },
    });

    return deleted;
  });
}

// Soft delete: marca CANCELLED pero no toca tickets ni orders
export async function cancelEventById(eventId: string) {
  return prisma.event.update({
    where: { id: eventId },
    data: {
      status: 'CANCELLED',
    },
  });
}