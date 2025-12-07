import type { NextFunction, Request, Response } from 'express';
import { createEventSchema } from './events.schemas';
import * as eventsService from './events.service';
import { AppError } from '../../core/errors/AppError';

export async function createEventHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      throw new AppError(401, 'Unauthorized');
    }

    const parsed = createEventSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, 'Validation error', parsed.error.flatten());
    }

    const event = await eventsService.createEvent(req.user.id, parsed.data);

    return res.status(201).json({ event });
  } catch (err) {
    next(err);
  }
}

export async function listEventsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const events = await eventsService.listPublishedEvents();
    return res.status(200).json({ events });
  } catch (err) {
    next(err);
  }
}

export async function getEventHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const event = await eventsService.getEvent(id);
    return res.status(200).json({ event });
  } catch (err) {
    next(err);
  }
}

export async function deleteEventHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      throw new AppError(401, 'Unauthorized');
    }

    const eventId = req.params.id;
    const role = req.user.role as 'ADMIN' | 'ORGANIZER' | 'CUSTOMER';

    await eventsService.deleteEventService(eventId, req.user.id, role);

    return res.status(204).send(); // sin body
  } catch (err) {
    next(err);
  }
}