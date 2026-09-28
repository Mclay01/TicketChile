import Link from 'next/link';
import {redirect} from 'next/navigation';
import {AccessError} from '@/lib/access.server';
import {adminContext} from '@/lib/admin/policy.server';
import {sections,sectionCapability,type Section} from '@/lib/admin/queries.server';
import '@/app/organizer.css';
import '@/app/admin.css';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){
 const ctx=await adminContext().catch(e=>{if(e instanceof AccessError&&[401,403].includes(e.status))redirect('/admin/login');throw e;});
 const links=Object.entries(sections).filter(([s])=>ctx.capabilities.includes(sectionCapability(s as Section))).map(([s,label])=><Link key={s} href={s==='overview'?'/admin':`/admin/${s}`}>{label}</Link>);
 return <div className="tc org-shell admin-shell"><a className="skip" href="#admin-main">Ir al contenido</a><aside className="org-sidebar"><Link className="org-brand" href="/admin"><span className="brand-mark"/>TicketChile <small>ADMIN</small></Link><div className="org-identity"><p>{ctx.name}</p><span className="hint">{ctx.role} / MFA</span></div><nav aria-label="Administración">{links}<Link href="/security?kind=ADMIN">Seguridad y cuenta</Link></nav></aside><div className="org-body"><header className="org-top"><Link href="/admin">TicketChile / Operaciones</Link><Link className="hint" href="/security?kind=ADMIN">{ctx.name} / Seguridad</Link></header><details className="admin-mobile-menu"><summary>Secciones de administración</summary><nav>{links}</nav></details><main id="admin-main" className="org-main">{children}</main></div></div>;
}
