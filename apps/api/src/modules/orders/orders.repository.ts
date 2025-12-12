import { prisma } from '../../core/db/client';
import { randomUUID } from 'crypto';
import type { CreateOrderInput } from './orders.schemas';

export async function findTicketsForOrganizer(organizerId: string) {
  return prisma.ticket.findMany({
    where: {
      order: {
        event: {
          organizerId
        }
      }
    },
    include: {
      ticketType: true,
      order: {
        include: {
          event: true,
          user: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function findEventWithTicketTypes(eventId: string) {
  return prisma.event.findUnique({
    where: { id: eventId },
    include: {
      ticketTypes: true
    }
  });
}

export async function countIssuedTicketsForTicketType(ticketTypeId: string) {
  return prisma.ticket.count({
    where: {
      ticketTypeId,
      status: {
        not: 'CANCELLED'
      }
    }
  });
}

export async function createOrderWithTickets(args: {
  userId: string;
  eventId: string;
  currency: string;
  totalAmountCents: number;
  tickets: {
    ticketTypeId: string;
    attendeeName: string;
    attendeeEmail: string;
  }[];
  flowToken?: string | null;
  flowOrder?: number | null;
}) {
  const {
    userId,
    eventId,
    currency,
    totalAmountCents,
    tickets,
    flowToken,
    flowOrder,
  } = args;

  return prisma.order.create({
    data: {
      userId,
      eventId,
      currency,
      totalAmountCents,
      flowToken: flowToken ?? null,
      flowOrder: flowOrder ?? null,
      tickets: {
        create: tickets.map((t) => ({
          ticketTypeId: t.ticketTypeId,
          attendeeName: t.attendeeName,
          attendeeEmail: t.attendeeEmail,
        })),
      },
    },
    include: {
      tickets: true,
      event: true,
    },
  });
}


export async function findTicketsForUser(userId: string) {
  return prisma.ticket.findMany({
    where: {
      order: {
        userId
      }
    },
    include: {
      order: {
        select: {
          id: true,
          createdAt: true,
          event: {
            select: {
              id: true,
              title: true,
              startDateTime: true,
              venueName: true,
              venueAddress: true
            }
          }
        }
      },
      ticketType: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}

export async function findTicketsByBuyerEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { attendeeEmail: normalized },
        { order: { user: { email: normalized } } },
      ],
    },
    include: {
      ticketType: true,
      order: {
        include: {
          event: true,
          user: true, // puede ser null si la orden fue pública y user fue creado
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return tickets.map((t) => ({
    id: t.id,
    code: t.code,
    attendeeName: t.attendeeName,
    attendeeEmail: t.attendeeEmail,
    ticketType: t.ticketType ? { id: t.ticketType.id, name: t.ticketType.name } : null,
    orderId: t.orderId,
    order: t.order
      ? {
          id: t.order.id,
          createdAt: t.order.createdAt,
          user: t.order.user ? { id: t.order.user.id, name: t.order.user.name, email: t.order.user.email } : null,
          event: t.order.event
            ? {
                id: t.order.event.id,
                title: t.order.event.title,
                startDateTime: t.order.event.startDateTime,
                venueName: t.order.event.venueName,
                venueAddress: t.order.event.venueAddress,
              }
            : null,
        }
      : null,
    createdAt: t.createdAt,
  }));
}

export async function findOrderByFlowToken(token: string) {
  return prisma.order.findFirst({
    where: { flowToken: token },
    include: {
      event: true,
      tickets: true,
    },
  });
}
