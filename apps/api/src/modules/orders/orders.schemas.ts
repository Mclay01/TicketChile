// src/modules/orders/orders.schemas.ts

import { z } from 'zod';

export const createOrderSchema = z.object({
  eventId: z.string().min(1),
  items: z.array(
    z.object({
      ticketTypeId: z.string().min(1),
      quantity: z.number().int().min(1),
    })
  ),
});

export const publicCreateOrderSchema = z.object({
  eventId: z.string().min(1),
  buyerName: z.string().optional(),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().optional(), // <-- NUEVO (para WhatsApp)
  items: z.array(
    z.object({
      ticketTypeId: z.string().min(1),
      quantity: z.number().int().min(1),
    })
  ),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type PublicCreateOrderInput = z.infer<typeof publicCreateOrderSchema>;
