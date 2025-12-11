import { Router } from 'express';
import { authMiddleware } from '../../core/middleware/authMiddleware';
import {
  createOrderHandler,
  listMyTicketsHandler,
  listTicketsForOrganizerHandler,
  getPublicOrderByFlowTokenHandler,
} from './orders.controller';

export const ordersRouter = Router();

// Crear orden (compra) - usuario logueado
// POST /api/orders
ordersRouter.post('/', authMiddleware, createOrderHandler);

// Ver todos mis tickets
// GET /api/orders/my-tickets
ordersRouter.get('/my-tickets', authMiddleware, listMyTicketsHandler);

// Tickets de mis eventos (organizador)
// GET /api/orders/organizer-tickets
ordersRouter.get(
  '/organizer-tickets',
  authMiddleware,
  listTicketsForOrganizerHandler,
);

// ✅ Endpoint público para la página "compra-exitosa"
// GET /api/orders/public/by-flow-token?token=...
ordersRouter.get('/public/by-flow-token', getPublicOrderByFlowTokenHandler);
