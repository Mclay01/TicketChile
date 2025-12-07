import { z } from 'zod';

export const ticketTypeInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priceCents: z.number().int().positive(),
  currency: z.string().min(1),
  capacity: z.number().int().positive(),
  perUserLimit: z.number().int().positive().optional(),
  salesStartDateTime: z.string().datetime().optional(),
  salesEndDateTime: z.string().datetime().optional()
});

export const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  venueName: z.string().min(1),
  venueAddress: z.string().min(1),
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  totalCapacity: z.number().int().positive(),
  ticketTypes: z.array(ticketTypeInputSchema).min(1)
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
