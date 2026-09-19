import { organizerContext } from '@/lib/organizer/events.server';
import Create from '@/components/organizer/Create';
import { PageHeading,Notice } from '@/components/tc/ui';
export default async function NewEvent(){const ctx=await organizerContext();const orgs=ctx.organizations.filter(o=>o.can_create);return <div className="stack"><PageHeading eyebrow="Nuevo evento" title="Dale forma al encuentro."/>{orgs.length?<Create organizations={orgs}/>:<Notice>No tienes permiso para crear eventos. Puedes operar los eventos que te asignaron.</Notice>}</div>;}
