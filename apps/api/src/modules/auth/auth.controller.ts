import type { NextFunction, Request, Response } from 'express';
import { loginSchema } from './auth.schemas';
import * as authService from './auth.service';
import { AppError } from '../../core/errors/AppError';

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, 'Validation error', parsed.error.flatten());
    }

    const result = await authService.login(parsed.data);

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function meHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      throw new AppError(401, 'Unauthorized');
    }

    const user = await authService.getCurrentUser(req.user.id);

    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}
