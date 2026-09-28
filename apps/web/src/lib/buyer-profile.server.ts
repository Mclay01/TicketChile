import 'server-only';
import { withTx } from '@/lib/db';
import { AccessError } from '@/lib/access.server';
import { currentIdentity } from '@/lib/security/current.server';
import { principal, type Principal } from '@/lib/security/identity.server';
import { audit } from '@/lib/security/audit.server';
import { limit } from '@/lib/security/rate-limit.server';
export async function updateBuyerProfile(body:Record<string,unknown>,p?:Principal) {
  const me=p||await currentIdentity('BUYER');
  await limit('buyer-profile',me.id,{hits:30,seconds:3600});
  const name=typeof body.name==='string'?body.name.trim():'',phone=typeof body.phone==='string'?body.phone.trim():'';
  if(Object.keys(body).some(k=>!['name','phone'].includes(k))||typeof body.phone!=='string'||name.length<2||name.length>100||/[\x00-\x1f\x7f]/.test(name)||phone.length>30||(phone&&!/^\+?[\d ()-]{6,30}$/.test(phone)))throw new AccessError(400,'INVALID_PROFILE','Revisa el nombre (2 a 100 caracteres) y el teléfono.');
  return withTx(async db=>{
    const current=await principal('BUYER',me.id,db);
    if(me.kind!=='BUYER'||!current||current.version!==me.version||!current.active||!current.verified||current.disabled)throw new AccessError(401,'UNAUTHENTICATED','Inicia sesión nuevamente.');
    await db.query('UPDATE usuarios SET nombre=$2,phone=$3,updated_at=now() WHERE id=$1',[me.id,name,phone]);
    await audit(db,{actor:me,action:'buyer.profile_updated',targetType:'identity',targetId:me.id});
    return {ok:true};
  });
}
