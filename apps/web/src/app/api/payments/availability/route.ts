import { privateJson } from '@/lib/access.server';
import { availability, providers } from '@/lib/payments/config.server';
export const dynamic='force-dynamic';
export function GET() {return privateJson(200,{providers:providers.map(availability)});}
