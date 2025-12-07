import { AppError } from '../../core/errors/AppError';
import type { CreateEventInput } from './events.schemas';
import * as eventsRepo from './events.repository';

export async function createEvent(
  organizerId: string,
  payload: CreateEventInput
) {
  const start = new Date(payload.startDateTime);
  const end = new Date(payload.endDateTime);

  if (end <= start) {
    throw new AppError(400, 'endDateTime must be after startDateTime');
  }

  const totalTicketsCapacity = payload.ticketTypes.reduce(
    (sum, tt) => sum + tt.capacity,
    0
  );

  if (totalTicketsCapacity > payload.totalCapacity) {
    throw new AppError(
      400,
      'Sum of ticketTypes.capacity cannot exceed totalCapacity',
      {
        totalCapacity: payload.totalCapacity,
        totalTicketsCapacity
      }
    );
  }

  const event = await eventsRepo.createEventWithTicketTypes(
    organizerId,
    payload
  );

  return event;
}

export async function listPublishedEvents() {
  return eventsRepo.findPublishedEvents();
}

export async function getEvent(id: string) {
  const event = await eventsRepo.findEventById(id);

  if (!event) {
    throw new AppError(404, 'Event not found');
  }

  return event;
}

export async function deleteEventService(
  eventId: string,
  userId: string,
  role: 'ADMIN' | 'ORGANIZER' | 'CUSTOMER'
) {
  const event = await eventsRepo.findEventById(eventId);
  if (!event) {
    throw new AppError(404, 'Event not found');
  }

  // Solo organizador dueño o admin
  if (role !== 'ADMIN' && event.organizerId !== userId) {
    throw new AppError(403, 'You cannot delete this event');
  }

  const [ticketsCount, ordersCount] = await Promise.all([
    eventsRepo.countTicketsForEvent(eventId),
    eventsRepo.countOrdersForEvent(eventId),
  ]);

  // 1) SIN tickets NI órdenes -> hard delete real
  if (ticketsCount === 0 && ordersCount === 0) {
    await eventsRepo.deleteEventById(eventId);
    return;
  }

  // 2) CON tickets/órdenes -> solo podemos "eliminar publicación"
  const now = new Date();
  const hasEnded = event.endDateTime < now;

  const notUsedCount = await eventsRepo.countNotUsedTicketsForEvent(eventId);
  const allTicketsUsed = ticketsCount > 0 && notUsedCount === 0;

  // 👉 tu regla: si el evento ya caducó O todos los tickets están usados
  if (!(hasEnded || allTicketsUsed)) {
    throw new AppError(
      400,
      'Solo se puede eliminar un evento con tickets si ya terminó o si todos los tickets están usados.'
    );
  }

  // Soft delete: mantenemos tickets y órdenes, solo marcamos CANCELLED
  await eventsRepo.cancelEventById(eventId);
}