// apps/api/src/modules/checkins/checkins.service.ts
import { prisma } from '../../core/db/client';
import { AppError } from '../../core/errors/AppError';
import type { ScanTicketInput } from './checkins.schemas';

export type ScanResultStatus = 'OK' | 'ALREADY_USED' | 'NOT_FOUND' | 'INVALID';

export async function scanTicket(
  _scannerUserId: string,
  payload: ScanTicketInput
) {
  const code = payload.code.trim();

  if (!code) {
    throw new AppError(400, 'Ticket code is required');
  }

  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: {
      ticketType: true,
      order: {
        select: {
          id: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          event: {
            select: {
              id: true,
              title: true,
              startDateTime: true,
              venueName: true,
              venueAddress: true,
            },
          },
        },
      },
    },
  });

  // 1) No existe → NOT_FOUND (no tiramos 404, devolvemos JSON normal)
  if (!ticket) {
    return {
      status: 'NOT_FOUND' as ScanResultStatus,
    };
  }

  // 2) Cancelado → INVALID
  if (ticket.status === 'CANCELLED') {
    return {
      status: 'INVALID' as ScanResultStatus,
      ticket,
    };
  }

  // 3) Ya usado → ALREADY_USED
  if (ticket.status === 'USED') {
    return {
      status: 'ALREADY_USED' as ScanResultStatus,
      ticket,
    };
  }

  // 4) Primera vez: asumimos VALID → lo marcamos como USED
  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'USED',
      usedAt: new Date(),
    },
    include: {
      ticketType: true,
      order: {
        select: {
          id: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          event: {
            select: {
              id: true,
              title: true,
              startDateTime: true,
              venueName: true,
              venueAddress: true,
            },
          },
        },
      },
    },
  });

  return {
    status: 'OK' as ScanResultStatus,
    ticket: updated,
  };
}
