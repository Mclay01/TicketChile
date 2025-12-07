import { Router } from 'express';
import { authMiddleware } from '../../core/middleware/authMiddleware';
import { requireRole } from '../../core/middleware/requireRole';
import { scanTicketHandler } from './checkins.controller';

export const checkinsRouter = Router();

// Escaneo de ticket
// POST /api/checkins/scan
checkinsRouter.post(
  '/scan',
  authMiddleware,
  requireRole(['ORGANIZER', 'ADMIN']),
  scanTicketHandler
);
