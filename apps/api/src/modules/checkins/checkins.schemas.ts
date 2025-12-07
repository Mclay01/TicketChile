import { z } from 'zod';

export const scanTicketSchema = z.object({
  code: z.string().min(1, 'Ticket code is required')
});

export type ScanTicketInput = z.infer<typeof scanTicketSchema>;
