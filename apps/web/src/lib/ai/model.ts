import type {Draft} from '@/lib/organizer/model';

export const features = ['event','title','description','shorten','summary','faq','seo','tiers','readiness','analytics','promotion','communication'] as const;
export type Feature = typeof features[number];
export const featureNames:Record<Feature,string> = {event:'Proponer evento',title:'Mejorar título',description:'Mejorar descripción',shorten:'Acortar descripción',summary:'Resumen público',faq:'Preguntas frecuentes',seo:'Título y descripción SEO',tiers:'Estructura de entradas',readiness:'Revisar información pendiente',analytics:'Interpretar métricas',promotion:'Idea de promoción',communication:'Borrador de comunicación'};
export const fieldNames:Record<string,string> = {title:'Nombre',description:'Descripción',category_slug:'Categoría',date_iso:'Inicio (ISO con zona)',end_at:'Cierre (ISO con zona)',timezone:'Zona horaria',venue:'Recinto',address:'Dirección exacta',city:'Ciudad',region:'Región',capacity:'Aforo',age_policy:'Condiciones de edad',access_info:'Acceso',faq:'Preguntas frecuentes',tiers:'Entradas propuestas (se añaden inactivas)',short_description:'Resumen público',seo_title:'Título SEO',seo_description:'Descripción SEO'};
export const criticalFields = ['capacity','tiers','date_iso','end_at','timezone','venue','address','city','region','age_policy'];
export type Metric = {key:string;label:string;value:number;unit:string};
export type Insight = {text:string;metrics:string[]};
export type AIOutput = {patch:Partial<Draft>;missing:string[];warnings:string[];inferences:Insight[];recommendations:Insight[];copy:string};
export type Proposal = AIOutput & {id:string;source:string;model:string;feature:Feature;baseRevision:number;facts:Metric[]};
export type ProviderStatus = {enabled:boolean;development:boolean;label:string};

export const allowedFields:Record<Feature,string[]> = {
 event:Object.keys(fieldNames),title:['title'],description:['description'],shorten:['description'],summary:['short_description'],faq:['faq'],seo:['seo_title','seo_description'],tiers:['tiers','capacity'],readiness:[],analytics:[],promotion:[],communication:[],
};
