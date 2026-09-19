import { roleNames } from '@/lib/organizer/model';
import { redirect } from 'next/navigation';
import '@/app/organizer.css';
import { AccessError } from '@/lib/access.server';
import { organizerContext } from '@/lib/organizer/events.server';
import OrganizerShell from '@/components/organizer/Shell';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){
 const ctx=await organizerContext().catch(e=>{if(e instanceof AccessError&&(e.status===401||e.status===403))redirect('/organizador/login?reason=access');throw e;});
 return <OrganizerShell kind={ctx.actor.kind} names={ctx.organizations.map(o=>o.name).join(' / ')} role={ctx.actor.kind==='ORGANIZER'?'Propietario':ctx.organizations.map(o=>roleNames[o.role]).join(' / ')} canCreate={ctx.organizations.some(o=>o.can_create)}>{children}</OrganizerShell>;
}
