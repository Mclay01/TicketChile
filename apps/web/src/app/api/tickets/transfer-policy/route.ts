import { accessResponse, privateJson, requireSameOrigin } from '@/lib/access.server';
import { readBody } from '@/lib/security/http.server';
import { configureTransferPolicy } from '@/lib/transfer-policy.server';
export async function POST(request:Request) {
  try { requireSameOrigin(request); const b=await readBody(request); return privateJson(200,await configureTransferPolicy(String(b.eventId||''),b)); }
  catch(error) { return accessResponse(error); }
}
