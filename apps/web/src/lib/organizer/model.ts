export const states = ['DRAFT','IN_REVIEW','PUBLISHED','PAUSED','ENDED','CANCELLED'] as const;
export type Lifecycle = typeof states[number];
export const stateNames: Record<Lifecycle,string> = {DRAFT:'Borrador',IN_REVIEW:'En revisión',PUBLISHED:'Publicado',PAUSED:'Pausado',ENDED:'Finalizado',CANCELLED:'Cancelado'};
export const capabilityNames:Record<string,string>={'event.read':'Consultar evento','event.edit':'Editar evento','scanner.read':'Consultar acceso','scanner.checkin':'Registrar ingreso','attendees.read':'Consultar asistentes','attendees.export':'Exportar asistentes','finance.read':'Consultar ventas','staff.manage':'Administrar equipo','audit.read':'Consultar auditoría'};
export const roleNames:Record<string,string>={ORGANIZER_OWNER:'Propietario',ORGANIZER_MANAGER:'Gestión de eventos',ORGANIZER_DOOR:'Puerta',ORGANIZER_FINANCE:'Finanzas',ORGANIZER_SUPPORT:'Soporte'};
export type Tier = {id:string;name:string;description:string;price_clp:number;capacity:number;max_per_order:number;sales_start:string|null;sales_end:string|null;visible:boolean;active:boolean;sold?:number;held?:number};
export type Draft = {title:string;description:string;category_slug:string;date_iso:string|null;end_at:string|null;timezone:string;venue:string;address:string;city:string;region:string;capacity:number;age_policy:string;visibility:'PUBLIC'|'UNLISTED';access_info:string;image:string;hero_desktop:string;hero_mobile:string;faq:string;tiers:Tier[]};
export type EventRecord = Draft & {id:string;slug:string;organizer_id:string;organizer_name:string;lifecycle:Lifecycle;revision:number;updated_at:string;cancellation_followup:string|null;capabilities:string[]};
export const emptyDraft: Draft = {title:'',description:'',category_slug:'',date_iso:null,end_at:null,timezone:'America/Santiago',venue:'',address:'',city:'',region:'',capacity:0,age_policy:'',visibility:'PUBLIC',access_info:'',image:'',hero_desktop:'',hero_mobile:'',faq:'',tiers:[]};
export function checklist(d:Draft) {
  return [
    {label:'Nombre del evento',ok:d.title.trim().length>=3},
    {label:'Categoría y descripción',ok:!!d.category_slug&&d.description.trim().length>=20},
    {label:'Inicio futuro y cierre posterior',ok:!!d.date_iso&&new Date(d.date_iso).getTime()>Date.now()&&!!d.end_at&&new Date(d.end_at)>new Date(d.date_iso)},
    {label:'Recinto, dirección, ciudad y región',ok:!!d.venue.trim()&&!!d.address.trim()&&!!d.city.trim()&&!!d.region.trim()},
    {label:'Imagen principal',ok:!!d.image},
    {label:'Capacidad asignada sin exceder el aforo',ok:d.capacity>0&&d.tiers.reduce((n,t)=>n+t.capacity,0)<=d.capacity},
    {label:'Entrada pública activa con precio y disponibilidad',ok:d.tiers.some(t=>t.active&&t.visible&&t.price_clp>0&&t.capacity>(t.sold||0)+(t.held||0)&&(!t.sales_end||new Date(t.sales_end)>new Date()))},
    {label:'Condiciones de edad y acceso confirmadas',ok:!!d.age_policy.trim()&&!!d.access_info.trim()},
  ];
}
export const transitions:Record<Lifecycle,Lifecycle[]>={DRAFT:['IN_REVIEW'],IN_REVIEW:['DRAFT','PUBLISHED'],PUBLISHED:['PAUSED','ENDED','CANCELLED'],PAUSED:['PUBLISHED','ENDED','CANCELLED'],ENDED:[],CANCELLED:[]};
