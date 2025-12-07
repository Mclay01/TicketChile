// src/modules/orders/publicOrders.routes.ts
import { Router } from 'express';
import { publicCreateOrderController } from './publicOrders.controller';
import { publicResendTicketsController } from './publicOrders.resend.controller';

export const publicOrdersRouter = Router();

// POST /api/public/orders
publicOrdersRouter.post('/orders', publicCreateOrderController);

// POST /api/public/orders/resend
// Body: { email: string }
publicOrdersRouter.post('/orders/resend', publicResendTicketsController);
