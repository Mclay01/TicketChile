// apps/api/src/modules/payments/payments.routes.ts
import { Router } from 'express';
import express from 'express';
import { createCheckoutSessionHandler, flowConfirmationHandler } from './payments.controller';

export const paymentsRouter = Router();

// Crear sesión de pago (Flow)
paymentsRouter.post('/checkout-session', createCheckoutSessionHandler);

// Confirmación de Flow (webhook tipo POST x-www-form-urlencoded)
paymentsRouter.post(
  '/flow-confirmation',
  express.urlencoded({ extended: false }), // Flow manda form-urlencoded, no JSON
  flowConfirmationHandler
);
