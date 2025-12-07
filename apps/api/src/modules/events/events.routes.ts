import { Router } from 'express';
import { authMiddleware } from '../../core/middleware/authMiddleware';
import { requireRole } from '../../core/middleware/requireRole';
import {
  createEventHandler,
  listEventsHandler,
  getEventHandler,
  deleteEventHandler,
} from './events.controller';

export const eventsRouter = Router();

// Público: lista de eventos publicados
// GET /api/events
eventsRouter.get('/', listEventsHandler);

// Público: detalle evento
// GET /api/events/:id
eventsRouter.get('/:id', getEventHandler);

// Protegido: crear evento (solo ORGANIZER o ADMIN)
// POST /api/events
eventsRouter.post(
  '/',
  authMiddleware,
  requireRole(['ORGANIZER', 'ADMIN']),
  createEventHandler
);

// DELETE /api/events/:id
eventsRouter.delete('/:id', authMiddleware, deleteEventHandler);