// src/modules/orders/publicOrders.service.ts

import { AppError } from '../../core/errors/AppError';
import type { PublicCreateOrderInput } from './orders.schemas';
import * as ordersRepo from './orders.repository';
import * as usersRepo from '../users/users.repository';
import { sendOrderTicketsEmail } from '../../core/mail';

/**
 * Servicio para crear una orden pública (cliente sin login).
 * - Busca o crea un usuario por email.
 * - Valida capacidad y precios.
 * - Crea la orden y los tickets usando el repository (createOrderWithTickets).
 * - Envía el email con los tickets (no rompe si falla el envío).
 */
export async function publicCreateOrderService(
  payload: PublicCreateOrderInput
) {
  const buyerEmail = payload.buyerEmail.trim().toLowerCase();
  const buyerName = payload.buyerName?.trim() ?? '';

  // Buscar o crear usuario por email
  let user = await usersRepo.findUserByEmail(buyerEmail);

  if (!user) {
    user = await usersRepo.createUser({
      name: buyerName || buyerEmail.split('@')[0],
      email: buyerEmail,
      // passwordHash solo para rellenar el campo; no se usará para login
      passwordHash: 'PUBLIC_ORDER_NO_LOGIN'
    });
  }


  // Obtener el evento y ticketTypes para validar
  const event = await ordersRepo.findEventWithTicketTypes(payload.eventId);
  if (!event) {
    throw new AppError(404, 'Event not found');
  }

  if (event.status !== 'PUBLISHED') {
    throw new AppError(400, 'Event is not available for sale');
  }

  if (!event.ticketTypes || event.ticketTypes.length === 0) {
    throw new AppError(400, 'Event has no ticket types');
  }

  const ticketTypesById = new Map(event.ticketTypes.map((tt) => [tt.id, tt]));

  // Agrupar cantidades por ticketTypeId
  const aggregated: Record<string, number> = {};
  for (const item of payload.items) {
    if (!ticketTypesById.has(item.ticketTypeId)) {
      throw new AppError(400, 'Invalid ticketTypeId for this event', {
        ticketTypeId: item.ticketTypeId
      });
    }
    aggregated[item.ticketTypeId] =
      (aggregated[item.ticketTypeId] ?? 0) + item.quantity;
  }

  // Verificar capacidad y calcular total
  let totalAmountCents = 0;
  const ticketsToCreate: {
    ticketTypeId: string;
    attendeeName: string;
    attendeeEmail: string;
  }[] = [];

  for (const [ticketTypeId, requestedQty] of Object.entries(aggregated)) {
    const ticketType = ticketTypesById.get(ticketTypeId)!;

    const alreadySold =
      await ordersRepo.countIssuedTicketsForTicketType(ticketTypeId);
    const remaining = ticketType.capacity - alreadySold;

    if (remaining < requestedQty) {
      throw new AppError(400, 'Not enough capacity for ticket type', {
        ticketTypeId,
        remaining,
        requested: requestedQty
      });
    }

    totalAmountCents += ticketType.priceCents * requestedQty;

    // Los tickets irán al nombre/email del comprador (no hay login)
    for (let i = 0; i < requestedQty; i++) {
      ticketsToCreate.push({
        ticketTypeId,
        attendeeName: buyerName || buyerEmail.split('@')[0],
        attendeeEmail: buyerEmail
      });
    }
  }

  // Asumimos misma moneda para todos los ticketTypes del evento
  const currencies = new Set(event.ticketTypes.map((tt) => tt.currency));
  if (currencies.size > 1) {
    throw new AppError(
      500,
      'Event has multiple currencies configured, not supported in this MVP'
    );
  }
  const currency = event.ticketTypes[0]?.currency ?? 'CLP';

  // Crear orden + tickets (usa el repository centralizado)
  const order = await ordersRepo.createOrderWithTickets({
    userId: user.id,
    eventId: event.id,
    currency,
    totalAmountCents,
    tickets: ticketsToCreate
  });

  if (!order) {
    throw new AppError(
      500,
      'No se pudo obtener la orden para enviar el mail'
    );
  }

  // Intentar enviar correo al comprador; no debe romper el flow si falla
  try {
    await sendOrderTicketsEmail({
      to: 'tickets@ticketchile.com',
      buyerName: buyerName || user.name || '',
      eventTitle: event.title,
      eventDate:
        event.startDateTime instanceof Date
          ? event.startDateTime.toISOString()
          : String(event.startDateTime),
      eventVenue: `${event.venueName} · ${event.venueAddress}`,
      tickets: order.tickets.map((t: any) => ({ code: t.code }))
    });
  } catch (err) {
    console.error('Error enviando correo de tickets (compra pública):', err);
  }

  return order;
}
