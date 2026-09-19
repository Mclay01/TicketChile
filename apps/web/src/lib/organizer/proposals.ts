import type {Draft} from './model';
export type Proposal={source:'LOCAL_RULES';baseRevision:number;patch:Partial<Draft>;missing:string[];warnings:string[]};
/** Explicit local parser for development/review QA, not a model response.
 * Only quoted titles, named cities and explicitly supplied numbers are extracted.
 * No lifecycle, address, legal policy, inferred date or confirmed price authority. */
export function localProposal(prompt:string,baseRevision:number):Proposal{
 const patch:Partial<Draft>={};
 const title=prompt.match(/[“"]([^”"]{3,120})[”"]/);
 if(title)patch.title=title[1];
 const city=prompt.match(/\ben (Santiago|Valparaíso|Concepción|Viña del Mar)\b/i);
 if(city)patch.city=city[1];
 if(/concierto/i.test(prompt))patch.category_slug='conciertos';
 else if(/fiesta/i.test(prompt))patch.category_slug='fiestas';
 const capacity=prompt.match(/\bpara (\d{1,6}) personas\b/i);if(capacity)patch.capacity=Number(capacity[1]);
 const matches=[...prompt.matchAll(/(?:^|[,.]\s*)([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ ]{1,40})\s+\$([\d.]{1,12})/g)];
 if(matches.length)patch.tiers=matches.map((m,i)=>({id:`proposed_${i+1}`,name:m[1].trim(),description:'',price_clp:Number(m[2].replaceAll('.','')),capacity:0,max_per_order:4,sales_start:null,sales_end:null,visible:true,active:false}));
 return {source:'LOCAL_RULES',baseRevision,patch,missing:['Fecha y horario exactos','Recinto y dirección confirmados','Imagen','Stock por tipo','Condiciones de edad y acceso'],warnings:['Propuesta de reglas locales, no generada por un modelo.','Los importes y el aforo extraídos son propuestas por confirmar.','Las entradas propuestas nacen inactivas y sin stock. No hay publicación automática.']};
}
