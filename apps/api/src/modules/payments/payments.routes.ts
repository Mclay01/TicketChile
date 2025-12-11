// apps/api/src/modules/payments/payments.routes.ts

import { Router } from 'express';
import express from 'express';
import {
  createCheckoutSessionHandler,
  flowConfirmationHandler,
  flowBrowserReturnHandler,
} from './payments.controller';

export const paymentsRouter = Router();

// Crear sesión de pago (Flow)
paymentsRouter.post('/checkout-session', createCheckoutSessionHandler);

// Confirmación de Flow (webhook tipo POST x-www-form-urlencoded)
paymentsRouter.post(
  '/flow-confirmation',
  express.urlencoded({ extended: false }), // Flow manda form-urlencoded, no JSON
  flowConfirmationHandler
);

// Retorno del navegador desde Flow (puede ser GET o POST)
paymentsRouter.all(
  '/flow-browser-return',
  express.urlencoded({ extended: false }),
  flowBrowserReturnHandler
);
