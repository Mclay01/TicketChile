// apps/api/src/modules/orders/orders.service.ts
import { AppError } from '../../core/errors/AppError';
import type { CreateOrderInput, PublicCreateOrderInput } from './orders.schemas';
import * as ordersRepo from './orders.repository';
import * as usersRepo from '../users/users.repository';
import { sendOrderTicketsEmail } from '../../core/mail';

export async function listTicketsForOrganizer(organizerId: string) {
  const tickets = await ordersRepo.findTicketsForOrganizer(organizerId);
  return tickets;
}

export async function createOrder(userId: string, payload: CreateOrderInput) {
  const user = await usersRepo.findUserById(userId);
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const event = await ordersRepo.findEventWithTicketTypes(payload.eventId);

  if (!event) {
    throw new AppError(404, 'Event not found');
  }

  if (event.status !== 'PUBLISHED') {
    throw new AppError(400, 'Event is not available for sale');
  }

  if (event.ticketTypes.length === 0) {
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

  let totalAmountCents = 0;
  const ticketsToCreate: {
    ticketTypeId: string;
    attendeeName: string;
    attendeeEmail: string;
  }[] = [];

  // Verificar capacidad y calcular total
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

    // Por ahora, todos los tickets a nombre del usuario
    for (let i = 0; i < requestedQty; i++) {
      ticketsToCreate.push({
        ticketTypeId,
        attendeeName: user.name,
        attendeeEmail: user.email
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

  const order = await ordersRepo.createOrderWithTickets({
    userId,
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

  // Enviar correo al usuario logueado (no rompemos si falla)
  try {
    await sendOrderTicketsEmail({
      to: user.email,
      buyerName: user.name,
      eventTitle: event.title,
      eventDate:
        event.startDateTime instanceof Date
          ? event.startDateTime.toISOString()
          : String(event.startDateTime),
      eventVenue: `${event.venueName} · ${event.venueAddress}`,
      tickets: order.tickets.map((t: any) => ({ code: t.code }))
    });
  } catch (err) {
    console.error(
      'Error enviando correo de tickets (compra con login):',
      err
    );
  }

  return order;
}

/**
 * Compra pública (sin login).
 * - Busca (o crea) un usuario por email.
 * - Reutiliza el flujo normal de createOrder.
 * - Envía correo con los tickets desde createOrder.
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
      // No se usará para login, sólo necesitamos rellenar el campo
      passwordHash: 'PUBLIC_ORDER_NO_LOGIN'
    });
  }

  // Reutilizamos toda la lógica de createOrder
  const order = await createOrder(user.id, {
    eventId: payload.eventId,
    items: payload.items.map((item) => ({
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity
    }))
  });

  return order;
}

export async function listMyTickets(
  userId: string,
  role: 'ADMIN' | 'ORGANIZER' | 'CUSTOMER'
) {
  if (role === 'ORGANIZER') {
    const tickets = await listTicketsForOrganizer(userId);
    return tickets;
  }

  const tickets = await ordersRepo.findTicketsForUser(userId);
  return tickets;
}
