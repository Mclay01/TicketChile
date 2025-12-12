import type { NextFunction, Request, Response } from 'express';
import * as paymentsService from '../payments/payments.service';
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
  next: NextFunction
) {
  try {
    const token = req.query.token as string | undefined;
    if (!token) {
      return res.status(400).json({ message: 'Missing token' });
    }

    // 1) Primero intentamos por flowToken (lo que ya tenías)
    const order = await ordersRepo.findOrderByFlowToken(token);

    if (order) {
      const richOrder = order as any;

      return res.json({
        id: richOrder.id,
        event: {
          title: richOrder.event.title,
          startDateTime: richOrder.event.startDateTime,
          venueName: richOrder.event.venueName,
          venueAddress: richOrder.event.venueAddress,
        },
        tickets: richOrder.tickets.map((t: any) => ({
          code: t.code,
          status: t.status,
          
        })),
      });
    }

    // 2) Fallback: si no hay order por flowToken, usamos el email de Flow
    //    (reutilizamos la lógica que ya te funciona para listar tickets)
    let buyerEmail: string | undefined;

    try {
      const payment = await paymentsService.getPaymentStatus(token);
      const optional = (payment as any).optional;

      let meta: any = null;
      if (typeof optional === 'string') {
        try {
          meta = JSON.parse(optional);
        } catch {
          meta = null;
        }
      } else if (typeof optional === 'object' && optional !== null) {
        meta = optional;
      }

      buyerEmail = meta?.buyerEmail;
    } catch (e) {
      console.error('[public/by-flow-token] Error llamando a Flow:', e);
    }

    if (!buyerEmail) {
      // No pudimos deducir el correo ⇒ para el front es "todavía no está"
      return res.status(404).json({ message: 'Order not found yet' });
    }

    // 3) Reutilizamos findTicketsByBuyerEmail (lo mismo que MisTickets)
    const tickets = await ordersRepo.findTicketsByBuyerEmail(buyerEmail);

    if (!tickets.length) {
      return res.status(404).json({ message: 'Order not found yet' });
    }

    // Están ordenados por createdAt DESC; tomamos la orden más reciente
    const first = tickets[0];
    const targetOrderId = (first.orderId ?? first.order?.id) as string;
    const event = first.order?.event;

    const ticketsForOrder = tickets.filter(
      (t) => (t.orderId ?? t.order?.id) === targetOrderId
    );

    return res.json({
      id: targetOrderId,
      event: {
        title: event?.title ?? 'Evento',
        startDateTime: event?.startDateTime ?? '',
        venueName: event?.venueName ?? '',
        venueAddress: event?.venueAddress ?? '',
      },
      tickets: ticketsForOrder.map((t) => ({
        code: t.code,
        status: t.status,
        
      })),
    });
  } catch (err) {
    console.error('[public/by-flow-token] Error general:', err);
    next(err);
  }
}

