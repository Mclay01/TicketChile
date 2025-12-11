import type { NextFunction, Request, Response } from 'express';
import { createOrderSchema } from './orders.schemas';
import * as ordersService from './orders.service';
import { AppError } from '../../core/errors/AppError';
import * as ordersRepo from './orders.repository';

export async function createOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      throw new AppError(401, 'Unauthorized');
    }

    // Protección adicional: si por alguna razón createOrderSchema es undefined
    if (!createOrderSchema || typeof createOrderSchema.safeParse !== 'function') {
      console.error('[orders] createOrderSchema not available', { createOrderSchema });
      throw new AppError(500, 'Server misconfiguration: validation schema missing');
    }

    const parsed = createOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, 'Validation error', parsed.error.flatten());
    }

    const order = await ordersService.createOrder(req.user.id, parsed.data);

    return res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
}

export async function listMyTicketsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      throw new AppError(401, 'Unauthorized');
    }

    // 👇 NUEVO: pasamos también el rol al servicio
    const role = req.user.role as 'ADMIN' | 'ORGANIZER' | 'CUSTOMER';

    const tickets = await ordersService.listMyTickets(req.user.id, role);

    return res.status(200).json({ tickets });
  } catch (err) {
    next(err);
  }
}

export async function listTicketsForOrganizerHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      throw new AppError(401, 'Unauthorized');
    }

    // req.user.id es el organizador
    const tickets = await ordersService.listTicketsForOrganizer(req.user.id);

    return res.status(200).json({ tickets });
  } catch (err) {
    next(err);
  }
}

export async function getPublicOrderByFlowTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = req.query.token as string | undefined;
    if (!token) {
      return res.status(400).json({ message: 'Missing token' });
    }

    const order = await ordersRepo.findOrderByFlowToken(token);

    if (!order) {
      // Todavía no se creó la orden para ese token
      return res.status(404).json({ message: 'Order not found yet' });
    }

    const richOrder = order as any;

    const tickets = Array.isArray(richOrder.tickets)
      ? richOrder.tickets
      : [];

    return res.json({
      orderId: richOrder.id,
      eventTitle: richOrder.event?.title ?? 'Evento',
      eventDate:
        (richOrder.event?.startDateTime as string | undefined) ?? null,
      eventVenue: richOrder.event
        ? [richOrder.event.venueName, richOrder.event.venueAddress]
            .filter(Boolean)
            .join(' · ')
        : null,
      tickets: tickets.map((t: any) => ({
        code: t.code,
        status: t.status,
        attendeeName: t.attendeeName,
        attendeeEmail: t.attendeeEmail,
      })),
    });
  } catch (err) {
    next(err);
  }
}

