import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

export function requireRole(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'Unauthorized');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(403, 'Forbidden');
    }

    next();
  };
}
