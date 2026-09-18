import { createPaymentRoute } from '@/lib/payments/create.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req: Request) { return createPaymentRoute(req,'stripe'); }
