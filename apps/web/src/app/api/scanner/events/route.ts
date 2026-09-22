import {accessResponse,privateJson} from '@/lib/access.server';
import {scannerEvents} from '@/lib/operations/access.server';
export async function GET(){try{return privateJson(200,await scannerEvents());}catch(e){return accessResponse(e);}}
