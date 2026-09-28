import {accessResponse,AccessError} from '@/lib/access.server';
import {adminList} from '@/lib/admin/queries.server';
import {requireAdminCapability} from '@/lib/admin/policy.server';
import {audit} from '@/lib/security/audit.server';
import {pool} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const csvCell=(v:unknown)=>`"${String(v??'').replace(/^[\s\u0000-\u001f]*([=+@-])/,'\'$1').replaceAll('"','""')}"`;
export async function GET(req:Request){
 try{
  const p=await requireAdminCapability('reports.read'),params=Object.fromEntries(new URL(req.url).searchParams);
  const from=Date.parse(params.from||''),to=Date.parse(params.to||'');
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from||to-from>31*86400000)throw new AccessError(400,'INVALID_RANGE','Elige un intervalo de hasta 31 días.');
  // A bounded export is complete or rejected; never silently truncate a financial report.
  const rows=[];for(let page=1;page<=21;page++){
   const batch=await adminList('reports',{...params,page:String(page)},p);rows.push(...batch.rows);
   if(rows.length>1000)throw new AccessError(413,'NARROW_FILTERS','Acota el intervalo o evento: máximo 1000 pagos.');
   if(!batch.hasMore)break;
  }
  await audit(pool,{actor:p,action:'admin.report.exported',targetType:'payment',eventId:params.event||undefined,organizerId:params.organizer||undefined,metadata:{outcome:String(rows.length)}});
  const keys=['id','event_id','order_id','provider','state','amount_clp','currency','fulfillment_status','verified_at','created_at'];
  return new Response('\uFEFF'+[keys.map(csvCell).join(','),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="pagos.csv"','Cache-Control':'private, no-store'}});
 }catch(e){return accessResponse(e);}
}
