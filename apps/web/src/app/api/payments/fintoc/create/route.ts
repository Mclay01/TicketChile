import { privateJson } from '@/lib/access.server';
export const dynamic='force-dynamic';
export async function POST() { return privateJson(410,{status:'DISABLED',code:'INTEGRATION_INCOMPLETE'}); }
