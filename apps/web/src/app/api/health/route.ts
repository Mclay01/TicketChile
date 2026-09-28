import { privateJson } from '@/lib/access.server';
export const dynamic = 'force-dynamic';
export function GET() { return privateJson(200, { alive: true }); }
