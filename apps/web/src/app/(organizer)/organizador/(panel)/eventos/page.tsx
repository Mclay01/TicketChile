import Link from 'next/link';
import { organizerEvents } from '@/lib/organizer/events.server';
import { states,stateNames } from '@/lib/organizer/model';
import EventList from '@/components/organizer/EventList';
import { PageHeading,EmptyState,Field } from '@/components/tc/ui';
export default async function Events({searchParams}:{searchParams:Promise<{state?:string;q?:string}>}){
 const {events,organizations}=await organizerEvents(),p=await searchParams,filtered=events.filter(e=>(!p.state||e.lifecycle===p.state)&&(!p.q||e.title.toLowerCase().includes(p.q.toLowerCase().slice(0,120))));
 return <div className="stack"><div className="row between"><PageHeading eyebrow="Organización" title="Mis eventos"/>{organizations.some(o=>o.can_create)&&<Link className="btn" href="/organizador/eventos/nuevo">Crear evento +</Link>}</div><form className="org-filter"><Field label="Buscar evento"><input name="q" defaultValue={p.q} maxLength={120}/></Field><Field label="Estado"><select name="state" defaultValue={p.state||''}><option value="">Todos</option>{states.map(s=><option key={s} value={s}>{stateNames[s]}</option>)}</select></Field><button className="btn secondary">Filtrar</button></form>{filtered.length?<EventList events={filtered}/>:<EmptyState title="No hay eventos con estos filtros">Prueba otro estado o crea un borrador.</EmptyState>}</div>;
}
