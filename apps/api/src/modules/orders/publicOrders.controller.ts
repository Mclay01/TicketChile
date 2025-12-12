// src/modules/orders/publicOrders.controller.ts

import type { Request, Response, NextFunction } from 'express';
import { publicCreateOrderSchema } from './orders.schemas';
import { AppError } from '../../core/errors/AppError';
import { publicCreateOrderService } from './orders.service';

export async function publicCreateOrderController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    console.log('🧾 public order body:', req.body);

    const parsed = publicCreateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Validation error', parsed.error.flatten());
    }

    const order = await publicCreateOrderService(parsed.data);

    return res.status(201).json({ orderId: order.id });
  } catch (err) {
    next(err);
  }
}
