import Link from 'next/link';
import {scannerEvents} from '@/lib/operations/access.server';
import {dateLabel} from '@/lib/discovery';
import {PageHeading,Notice} from '@/components/tc/ui';
import {stateNames,type Lifecycle} from '@/lib/organizer/model';
import {redirect} from 'next/navigation';
import {AccessError} from '@/lib/access.server';
export const dynamic='force-dynamic';
export default async function Page(){const events=await scannerEvents().catch(e=>{if(e instanceof AccessError&&e.status===401)redirect('/signin?callbackUrl=/scanner');throw e;});return <div className="tc"><main className="container page stack"><PageHeading eyebrow="Operación de acceso" title="Tus eventos asignados">Solo eventos autorizados por tu organización.</PageHeading>{events.map(e=><article className="history-row" key={e.id}><div><h2>{e.title||'Evento sin nombre'}</h2><p>{e.venue} · {e.city}</p><p className="hint">{e.date_iso?dateLabel(e.date_iso):'Fecha pendiente'} · {stateNames[e.lifecycle as Lifecycle]}</p>{e.starts_at&&<p className="hint">Ingreso desde {dateLabel(e.starts_at)}</p>}</div>{!e.enabled||['ENDED','CANCELLED'].includes(e.lifecycle)?<span>Acceso cerrado</span>:<Link className="btn" href={`/scanner/${e.id}`}>Abrir scanner</Link>}</article>)}{!events.length&&<Notice>No tienes eventos actuales o próximos asignados. Solicita acceso al propietario.</Notice>}</main></div>;}
