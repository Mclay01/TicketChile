// src/modules/orders/publicOrders.resend.controller.ts
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../core/errors/AppError';
import * as ordersRepo from './orders.repository';
import { sendOrderTicketsEmail } from '../../core/mail';

/**
 * POST /api/public/orders/resend
 * Body: { email: string }
 *
 * Busca tickets asociados al email y reenvía por correo (agrupado por evento).
 */
export async function publicResendTicketsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email } = req.body ?? {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new AppError(400, 'Email is required');
    }

    const tickets = await ordersRepo.findTicketsByBuyerEmail(email);

    if (!tickets || tickets.length === 0) {
      throw new AppError(404, 'No tickets found for this email');
    }

    // Agrupar tickets por evento (si hay varios eventos)
    const byEvent = new Map<
      string,
      {
        eventTitle: string;
        eventDate: string;
        eventVenue: string;
        buyerName: string;
        tickets: { code: string }[];
      }
    >();

    for (const t of tickets) {
      const ev = t.order?.event;
      const eventId = ev?.id ?? 'unknown-event';

      const buyerName =
        (t.order?.user && t.order.user.name) || t.attendeeName || '';

      const eventTitle = ev?.title ?? 'Evento';
      const rawEventDate = ev?.startDateTime ?? '';
      const eventVenue = ev ? `${ev.venueName} · ${ev.venueAddress}` : '';

      const eventDate =
        rawEventDate instanceof Date
          ? rawEventDate.toISOString()
          : String(rawEventDate);

      const entry = byEvent.get(eventId);
      if (!entry) {
        byEvent.set(eventId, {
          eventTitle,
          eventDate,
          eventVenue,
          buyerName,
          tickets: [{ code: t.code }]
        });
      } else {
        entry.tickets.push({ code: t.code });
      }
    }

    // Enviar un correo por cada evento encontrado
    const sendPromises: Promise<void>[] = [];
    for (const [, payload] of byEvent.entries()) {
      sendPromises.push(
        (async () => {
          try {
            await sendOrderTicketsEmail({
              to: email,
              buyerName: payload.buyerName,
              eventTitle: payload.eventTitle,
              eventDate: payload.eventDate,
              eventVenue: payload.eventVenue,
              tickets: payload.tickets
            });
          } catch (err) {
            console.error('Error enviando correo (resend):', err);
          }
        })()
      );
    }

    await Promise.all(sendPromises);

    return res
      .status(200)
      .json({ ok: true, sentForEvents: Array.from(byEvent.keys()) });
  } catch (err) {
    next(err);
  }
}
