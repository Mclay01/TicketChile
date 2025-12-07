import type { NextFunction, Request, Response } from 'express';
import { scanTicketSchema } from './checkins.schemas';
import * as checkinsService from './checkins.service';
import { AppError } from '../../core/errors/AppError';

export async function scanTicketHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      throw new AppError(401, 'Unauthorized');
    }

    const parsed = scanTicketSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, 'Validation error', parsed.error.flatten());
    }

    const result = await checkinsService.scanTicket(req.user.id, parsed.data);

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
