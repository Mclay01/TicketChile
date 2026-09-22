import {AccessError} from '@/lib/access.server';
/** Date-only filters include the complete UTC day; timestamp filters are exact. */
export function dateBound(value:string,end=false){
 const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(value),date=new Date(value);
 if(!Number.isFinite(date.getTime())||dateOnly&&date.toISOString().slice(0,10)!==value)throw new AccessError(400,'INVALID_FILTER','Fecha inválida.');
 if(dateOnly&&end)date.setUTCHours(23,59,59,999);
 return date;
}
