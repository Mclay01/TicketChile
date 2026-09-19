import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, withTx } from '@/lib/db';
import { AccessError, identifier } from '@/lib/access.server';
import { organizerActor, requireOrganizerCapability } from '@/lib/security/capabilities.server';
import type { Principal } from '@/lib/security/identity.server';
import { audit } from '@/lib/security/audit.server';
import { limit } from '@/lib/security/rate-limit.server';
import { lockInventory, expireHoldsTx, releaseHoldTx } from '@/lib/payments/inventory.server';
import { ownedMediaReference } from '@/lib/media-access.server';
import { eventMedia } from '@/lib/media';
import { checklist, emptyDraft, transitions, type Draft, type Tier, type EventRecord, type Lifecycle } from './model';

const caps=['event.read','event.edit','finance.read','attendees.read','attendees.export','scanner.read','scanner.checkin','staff.manage','audit.read'];
const permissions=`ARRAY(SELECT c FROM unnest($4::text[]) c WHERE security_can_event($1,$2,$3,e.id,c))`;
const args=(p:Principal)=>[p.kind,p.id,p.version,caps];
function fail(message:string,code='INVALID_EVENT',status=400):never{throw new AccessError(status,code,message);}
function json<T>(value:unknown):T{return JSON.parse(JSON.stringify(value)) as T;}
export async function organizerContext(){
  const actor=await organizerActor();
  const rows=await pool.query<{id:string;name:string;role:string;can_create:boolean}>(`SELECT o.id,o.display_name AS name,
    CASE WHEN $1='ORGANIZER' THEN 'ORGANIZER_OWNER' ELSE s.role END AS role,
    ($1='ORGANIZER' OR (s.event_ids IS NULL AND 'event.edit'=ANY(s.capabilities))) AS can_create
    FROM organizer_users o JOIN identity_accounts a ON a.kind='ORGANIZER' AND a.id=o.id AND NOT a.disabled
    JOIN identity_accounts me ON me.kind=$1 AND me.id=$2 AND me.version=$3 AND NOT me.disabled
    JOIN identity_principals p ON p.kind=me.kind AND p.id=me.id AND p.active AND p.verified
    LEFT JOIN organizer_staff s ON s.organizer_id=o.id AND s.buyer_id::text=$2 AND s.revoked_at IS NULL
    WHERE o.is_active AND o.approved AND o.verified AND (($1='ORGANIZER' AND o.id=$2) OR ($1='BUYER' AND s.id IS NOT NULL)) ORDER BY o.display_name`,args(actor).slice(0,3));
  if(!rows.rowCount)fail('No tienes acceso a una organización.','NOT_AUTHORIZED',403);
  return {actor,organizations:rows.rows};
}
export async function organizerEvents(){
  const context=await organizerContext();
  const result=await pool.query(`SELECT e.id,e.title,e.slug,e.date_iso,e.city,e.venue,e.lifecycle,e.capacity,e.revision,oe.organizer_id,
    ${permissions} AS capabilities,
    COALESCE((SELECT sum(sold)::int FROM ticket_types WHERE event_id=e.id),0) AS sold,
    CASE WHEN security_can_event($1,$2,$3,e.id,'finance.read') THEN
    (SELECT COALESCE(sum(amount_clp),0)::text FROM payments WHERE event_id=e.id AND status='PAID' AND verified_at IS NOT NULL) END AS gross
    FROM events e JOIN organizer_events oe ON oe.event_id=e.id
    WHERE EXISTS(SELECT 1 FROM unnest($4::text[]) c WHERE security_can_event($1,$2,$3,e.id,c))
    ORDER BY e.updated_at DESC,e.id LIMIT 200`,args(context.actor));
  return {...context,events:json<(Pick<EventRecord,'id'|'title'|'slug'|'date_iso'|'city'|'venue'|'lifecycle'|'capacity'|'capabilities'|'organizer_id'> & {sold:number;gross:string|null})[]>(result.rows)};
}
export async function readEvent(id:string,capability?:string,client?:PoolClient,actor?:Principal):Promise<EventRecord>{
  if(!identifier(id))fail('Evento no disponible.','NOT_FOUND',404);
  const p=actor||await organizerActor(), db=client||pool;
  const result=await db.query(`SELECT e.*,oe.organizer_id,o.display_name AS organizer_name,${permissions} AS capabilities,
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at,t.id) FROM ticket_types t WHERE t.event_id=e.id),'[]') AS tiers
    FROM events e JOIN organizer_events oe ON oe.event_id=e.id JOIN organizer_users o ON o.id=oe.organizer_id
    WHERE e.id=$5 AND CASE WHEN $6::text IS NULL THEN EXISTS(SELECT 1 FROM unnest($4::text[]) c WHERE security_can_event($1,$2,$3,e.id,c))
    ELSE security_can_event($1,$2,$3,e.id,$6) END ${client?'FOR UPDATE OF e':''}`,[...args(p),id,capability||null]);
  if(!result.rowCount)fail('Evento no disponible.','NOT_AUTHORIZED',404);
  const event=json<EventRecord>(result.rows[0]);
  for(const k of ['image','hero_desktop','hero_mobile'] as const)if(event[k]?.startsWith('data:'))event[k]=eventMedia(event[k],event.id,k==='image'?'poster':k==='hero_desktop'?'desktop':'mobile').replace('/api/event-media/','/api/event-preview-media/');
  event.category_slug ||= '';event.hero_desktop ||= '';event.hero_mobile ||= '';
  event.tiers=event.tiers.map(t=>({...t,max_per_order:t.max_per_order??10}));
  return event;
}
export async function createEvent(organizerId:string){
  const actor=await requireOrganizerCapability(organizerId,'event.edit');
  await limit('event-create',`${actor.kind}:${actor.id}`,{hits:20,seconds:3600});
  return withTx(async client=>{
    const id=`evt_${randomUUID()}`;
    await client.query(`INSERT INTO events(id,slug,title,city,venue,date_iso,description,image,lifecycle,is_published)
      VALUES($1,$1,'','','',NULL,'','','DRAFT',false)`,[id]);
    await client.query('INSERT INTO organizer_events(event_id,organizer_id) VALUES($1,$2)',[id,organizerId]);
    await audit(client,{actor,organizerId,eventId:id,action:'event.created',targetType:'event',targetId:id});
    return {id,revision:1};
  });
}
function text(v:unknown,max:number){if(typeof v!=='string'||v.length>max)fail('Texto inválido o demasiado extenso.');return v.trim();}
function integer(v:unknown,min:number,max:number){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)fail('Número fuera de rango.');return v;}
function date(v:unknown){if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))fail('Fecha inválida; incluye zona horaria.');return new Date(v).toISOString();}
export function validateDraft(input:unknown):Draft{
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Borrador inválido.');
  const v=input as Record<string,unknown>,d={...emptyDraft};
  for(const key of ['title','description','category_slug','timezone','venue','address','city','region','age_policy','access_info','image','hero_desktop','hero_mobile','faq'] as const)
    d[key]=text(v[key],['description','faq'].includes(key)?5000:['image','hero_desktop','hero_mobile'].includes(key)?300:500);
  try{new Intl.DateTimeFormat('es-CL',{timeZone:d.timezone});}catch{fail('Zona horaria inválida.');}
  d.date_iso=date(v.date_iso);d.end_at=date(v.end_at);d.capacity=integer(v.capacity,0,1000000);
  if(d.date_iso&&d.end_at&&d.end_at<=d.date_iso)fail('El cierre debe ser posterior al inicio.');
  if(v.visibility!=='PUBLIC'&&v.visibility!=='UNLISTED')fail('Visibilidad inválida.');d.visibility=v.visibility;
  if(!Array.isArray(v.tiers)||v.tiers.length>50)fail('Máximo 50 tipos de entrada.');
  d.tiers=v.tiers.map((t:Record<string,unknown>):Tier=>{
    if(!t||typeof t!=='object'||!identifier(t.id))fail('Identificador de entrada inválido.');
    const out:Tier={id:t.id as string,name:text(t.name,120),description:text(t.description,500),price_clp:integer(t.price_clp,0,100000000),capacity:integer(t.capacity,0,1000000),max_per_order:integer(t.max_per_order,1,10),sales_start:date(t.sales_start),sales_end:date(t.sales_end),visible:t.visible as boolean,active:t.active as boolean};
    if(!out.name||typeof out.visible!=='boolean'||typeof out.active!=='boolean')fail('Completa el tipo de entrada.');
    if(out.active&&out.price_clp===0)fail('Los tipos gratuitos deben permanecer inactivos hasta habilitar el flujo de cortesías.');
    if(out.sales_start&&out.sales_end&&out.sales_start>=out.sales_end)fail('La ventana de venta no es válida.');
    if(d.date_iso&&((out.sales_end&&out.sales_end>d.date_iso)||(out.sales_start&&out.sales_start>=d.date_iso)))fail('La venta debe terminar antes del evento.');
    return out;
  });
  if(new Set(d.tiers.map(t=>t.id)).size!==d.tiers.length)fail('Entradas duplicadas.');
  if(d.tiers.reduce((n,t)=>n+t.capacity,0)>d.capacity)fail('El stock total supera el aforo.');
  return d;
}
export async function saveEvent(id:string,revision:unknown,input:unknown,confirmPrices=false){
  const actor=await organizerActor();
  await limit('event-save',`${actor.kind}:${actor.id}`,{hits:120,seconds:60});
  return withTx(async client=>{
    await lockInventory(client);await expireHoldsTx(client);
    const old=await readEvent(id,'event.edit',client,actor);
    if(old.revision!==revision)fail('Hay una versión más reciente. Recarga antes de volver a guardar.','REVISION_CONFLICT',409);
    if(['ENDED','CANCELLED'].includes(old.lifecycle))fail('Este evento ya está cerrado.','EVENT_CLOSED',409);
    const d=validateDraft(input);
    if(d.category_slug&&!(await client.query('SELECT 1 FROM event_categories WHERE slug=$1',[d.category_slug])).rowCount)fail('Categoría inválida.');
    for(const k of ['image','hero_desktop','hero_mobile'] as const)if(d[k]!==old[k]){
      await ownedMediaReference(d[k],old.organizer_id);
      if(d[k]){
        const media=await client.query(`SELECT 1 FROM media_objects WHERE id::text=$1 AND organizer_id=$2
          AND (event_id IS NULL OR security_can_event($3,$4,$5,event_id,'event.edit'))`,[d[k].split('/').pop(),old.organizer_id,actor.kind,actor.id,actor.version]);
        if(!media.rowCount)fail('Imagen fuera del alcance autorizado.','NOT_AUTHORIZED',404);
      }
    }
    const sold=old.tiers.some(t=>(t.sold||0)>0),active=old.tiers.some(t=>(t.sold||0)+(t.held||0)>0);
    if(active&&['date_iso','end_at','venue','address','city','region','age_policy'].some(k=>d[k as keyof Draft]!==old[k as keyof Draft]))fail('Con compras o reservas, el cambio de fecha, ubicación o edad requiere revisión operativa.','CRITICAL_EDIT',409);
    let priceChange=false;
    for(const t of old.tiers){
      const next=d.tiers.find(n=>n.id===t.id);
      if(!next)fail('Conserva los tipos existentes; puedes desactivarlos.');
      if(next.capacity<(t.sold||0)+(t.held||0))fail('El stock no puede bajar de lo vendido y reservado.');
      if(next.price_clp!==t.price_clp)priceChange=true;
    }
    if(sold&&priceChange&&confirmPrices!==true)fail('Confirma el cambio de precios para ventas futuras. Las compras previas conservan su precio.','PRICE_CONFIRMATION',409);
    if(old.lifecycle==='PUBLISHED'&&!checklist({...d,tiers:d.tiers.map(t=>({...t,sold:old.tiers.find(o=>o.id===t.id)?.sold,held:old.tiers.find(o=>o.id===t.id)?.held}))}).filter(c=>!c.label.startsWith('Entrada pública')).every(c=>c.ok))fail('Pausa el evento antes de quitar información requerida.','PUBLISH_CHECKLIST',409);
    // Preserve existing legacy raster bytes when their safe display reference is unchanged.
    const keys=Object.keys(emptyDraft).filter(k=>k!=='tiers'&&(!['image','hero_desktop','hero_mobile'].includes(k)||d[k as keyof Draft]!==old[k as keyof Draft])) as (keyof Draft)[];
    await client.query(`UPDATE events SET ${keys.map((k,i)=>`${k}=$${i+2}`).join(',')},revision=revision+1,updated_at=now(),lifecycle=CASE WHEN lifecycle='IN_REVIEW' THEN 'DRAFT' ELSE lifecycle END WHERE id=$1`,[id,...keys.map(k=>k==='category_slug'?(d[k]||null):d[k])]);
    for(const t of d.tiers)await client.query(`INSERT INTO ticket_types(event_id,id,name,description,price_clp,capacity,max_per_order,sales_start,sales_end,visible,active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(event_id,id) DO UPDATE SET name=$3,description=$4,price_clp=$5,capacity=$6,max_per_order=$7,sales_start=$8,sales_end=$9,visible=$10,active=$11`,[id,t.id,t.name,t.description,t.price_clp,t.capacity,t.max_per_order,t.sales_start,t.sales_end,t.visible,t.active]);
    for(const action of ['event.updated',...(priceChange?['event.prices_changed']:[]),...(d.capacity!==old.capacity?['event.capacity_changed']:[]),...((d.tiers.length!==old.tiers.length||d.tiers.some(t=>{const before=old.tiers.find(o=>o.id===t.id);return !before||Object.keys(t).some(k=>!['sold','held'].includes(k)&&t[k as keyof Tier]!==before[k as keyof Tier]);}))?['event.tiers_changed']:[])])await audit(client,{actor,organizerId:old.organizer_id,eventId:id,action,targetType:'event',targetId:id});
    return {revision:old.revision+1};
  });
}
export async function transitionEvent(id:string,revision:unknown,target:unknown,confirmation:unknown){
  const actor=await organizerActor();
  return withTx(async client=>{
    await lockInventory(client);await expireHoldsTx(client);
    const e=await readEvent(id,'event.edit',client,actor);
    // Publication and destructive lifecycle authority is intentionally owner-only.
    if(actor.kind!=='ORGANIZER'||actor.id!==e.organizer_id)fail('Solo el propietario puede cambiar el estado.','NOT_AUTHORIZED',403);
    if(e.revision!==revision)fail('Recarga la versión actual.','REVISION_CONFLICT',409);
    if(typeof target!=='string'||!transitions[e.lifecycle].includes(target as Lifecycle))fail('Transición no permitida.');
    if(confirmation!==(target==='CANCELLED'?`CANCELAR ${id}`:target))fail('Confirma explícitamente la operación.');
    if(['IN_REVIEW','PUBLISHED'].includes(target)&&!checklist(e).every(c=>c.ok))fail('Completa la lista de publicación.','PUBLISH_CHECKLIST',409);
    if(target==='ENDED'&&(!e.end_at||new Date(e.end_at)>new Date()))fail('El evento aún no ha terminado.');
    if(target==='CANCELLED'||target==='ENDED'){
      const holds=await client.query("SELECT id FROM holds WHERE event_id=$1 AND status='ACTIVE' ORDER BY id",[id]);
      for(const h of holds.rows)await releaseHoldTx(client,h.id);
      if(target==='CANCELLED')await client.query("UPDATE tickets SET status='CANCELLED' WHERE event_id=$1 AND status='VALID'",[id]);
    }
    await client.query(`UPDATE events SET lifecycle=$2,is_published=($2='PUBLISHED'),revision=revision+1,updated_at=now(),
      cancellation_followup=CASE WHEN $2='CANCELLED' THEN 'REVIEW_REQUIRED' ELSE cancellation_followup END WHERE id=$1`,[id,target]);
    await audit(client,{actor,organizerId:e.organizer_id,eventId:id,action:`event.${target.toLowerCase()}`,targetType:'event',targetId:id,metadata:{outcome:target}});
    return {revision:e.revision+1,lifecycle:target};
  });
}
