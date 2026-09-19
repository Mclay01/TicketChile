import Link from 'next/link';
import { stateNames,type Lifecycle } from '@/lib/organizer/model';
import { formatCLP } from '@/lib/events';
import { dateLabel } from '@/lib/discovery';
export function EventState({state}:{state:Lifecycle}){return <span className={`status ${state==='PUBLISHED'?'':'inactive'}`}>{stateNames[state]}</span>;}
export default function EventList({events}:{events:{id:string;title:string;date_iso:string|null;city:string;venue:string;lifecycle:Lifecycle;capacity:number;sold:number;gross:string|null}[]}){
  return <div className="org-event-list">{events.map(e=><Link className="org-event-row" href={`/organizador/eventos/${e.id}`} key={e.id}><div className="stack-sm"><EventState state={e.lifecycle}/><h3>{e.title||'Evento sin nombre'}</h3><p className="hint">{e.date_iso?dateLabel(e.date_iso):'Fecha por definir'} · {e.city||'Ciudad pendiente'}<br/>{e.venue||'Recinto pendiente'}</p></div><div className="org-event-stock"><span className="mono">{e.sold} / {e.capacity}</span><span className="hint">entradas vendidas / aforo</span><progress aria-label="Entradas vendidas" value={e.sold} max={e.capacity||1}/></div><div className="org-event-action">{e.gross!==null&&<span className="mono">${formatCLP(Number(e.gross))}</span>}<span>Abrir evento →</span></div></Link>)}</div>;
}
