import type { NextFunction, Request, Response } from 'express';
import { AppError } from './AppError';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details ?? null
    });
  }

  console.error('Unhandled error:', err);

  return res.status(500).json({
    error: 'Internal server error'
  });
}
