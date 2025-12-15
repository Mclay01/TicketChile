import { Router } from 'express';
import { authMiddleware } from '../../core/middleware/authMiddleware';
import { requireRole } from '../../core/middleware/requireRole';
import {
  createEventHandler,
  listEventsHandler,
  getEventHandler,
  deleteEventHandler,
} from './events.controller';

const EVENTS_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=300';

function eventsCacheHeaders(_req: any, res: any, next: any) {
  res.setHeader('Cache-Control', EVENTS_CACHE_CONTROL);
  next();
}


export const eventsRouter = Router();

// Público: lista de eventos publicados
// GET /api/events
eventsRouter.get('/', eventsCacheHeaders, listEventsHandler);

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