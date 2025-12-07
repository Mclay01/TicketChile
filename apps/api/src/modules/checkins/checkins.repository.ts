// apps/api/src/modules/checkins/checkins.repository.ts
import { prisma } from '../../core/db/client';

export async function findTicketByCode(code: string) {
  const normalized = code.trim();

  return prisma.ticket.findUnique({
    where: { code: normalized },
    include: {
      ticketType: true,
      event: true,
      order: {
        include: {
          user: true,
          event: true,
        },
      },
    },
  });
}

export async function markTicketAsUsed(ticketId: string) {
  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: 'USED',
      usedAt: new Date(),
    },
    include: {
      ticketType: true,
      event: true,
      order: {
        include: {
          user: true,
          event: true,
        },
      },
    },
  });
}
