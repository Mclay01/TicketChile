import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './core/errors/errorHandler';
import { usersRouter } from './modules/users/users.routes';
import { authRouter } from './modules/auth/auth.routes';
import { eventsRouter } from './modules/events/events.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { checkinsRouter } from './modules/checkins/checkins.routes';
import { publicOrdersRouter } from './modules/orders/publicOrders.routes';
import { paymentsRouter } from './modules/payments/payments.routes';

export const app = express();

// Middlewares globales
// CORS primero y abierto para que funcione desde PC y móvil
app.use(
  cors({
    origin: true, // refleja el origin que venga (http://localhost:5173, http://TU_IP:5173, etc.)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(helmet());
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(morgan('dev'));

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Eventos
app.use('/api/events', eventsRouter);

// Orders / tickets del usuario
app.use('/api/orders', ordersRouter);

// Orders públicas (sin login) -> /api/public/orders
app.use('/api/public', publicOrdersRouter);

// Check-in
app.use('/api/checkins', checkinsRouter);

// Auth
app.use('/api/auth', authRouter);

// Users
app.use('/api/users', usersRouter);

// Payments
app.use('/api/payments', paymentsRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Errores
app.use(errorHandler);
