import type { NextFunction, Request, Response } from 'express';
import { registerUserSchema } from './users.schemas';
import * as usersService from './users.service';
import { AppError } from '../../core/errors/AppError';

export async function registerUserHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = registerUserSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, 'Validation error', parsed.error.flatten());
    }

    const user = await usersService.registerUser(parsed.data);

    return res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}
