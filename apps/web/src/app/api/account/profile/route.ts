import { accessResponse, privateJson, requireSameOrigin } from '@/lib/access.server';
import { readBody } from '@/lib/security/http.server';
import { updateBuyerProfile } from '@/lib/buyer-profile.server';
export async function PATCH(request:Request) {
  try { requireSameOrigin(request); return privateJson(200,await updateBuyerProfile(await readBody(request))); }
  catch(error) { return accessResponse(error); }
}
