import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../auth/jwt';

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers['authorization'];

  if (!header || typeof header !== 'string') {
    throw new AppError(401, 'Missing Authorization header');
  }

  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'Invalid Authorization header format');
  }

  try {
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      role: payload.role,
      tokenPayload: payload
    };

    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}
