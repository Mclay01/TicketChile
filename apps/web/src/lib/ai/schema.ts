import {allowedFields,type AIOutput,type Feature,type Metric} from './model';

type Schema = {type:string|string[];properties?:Record<string,Schema>;required?:string[];additionalProperties?:false;items?:Schema;enum?:unknown[];maxLength?:number;maxItems?:number;minimum?:number;maximum?:number};
const str=(maxLength=500):Schema=>({type:'string',maxLength});
const integer=(maximum:number):Schema=>({type:'integer',minimum:0,maximum});
const array=(items:Schema,maxItems=12):Schema=>({type:'array',items,maxItems});
const object=(properties:Record<string,Schema>):Schema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const nullable=(s:Schema):Schema=>({...s,type:[s.type as string,'null'],...(s.enum?{enum:[...s.enum,null]}:{})});
const date=nullable(str(40));
const tier=object({name:str(120),description:str(500),price_clp:integer(100000000),capacity:integer(1000000),max_per_order:{type:'integer',minimum:1,maximum:10},sales_start:date,sales_end:date});
const fields:Record<string,Schema> = {title:str(120),description:str(5000),category_slug:str(80),date_iso:str(40),end_at:str(40),timezone:str(80),venue:str(),address:str(),city:str(120),region:str(120),capacity:integer(1000000),age_policy:str(),access_info:str(),faq:str(5000),tiers:array(tier,12),short_description:str(300),seo_title:str(70),seo_description:str(170)};
const insight=object({text:str(1000),metrics:array(str(80),12)});
export function outputSchema(feature:Feature,categories:string[]=[]):Schema {
 const properties=Object.fromEntries(allowedFields[feature].map(k=>[k,nullable(k==='category_slug'?{...fields[k],enum:categories}:fields[k])]));
 return object({patch:object(properties),missing:array(str(200)),warnings:array(str(300)),inferences:array(insight,5),recommendations:array(insight,5),copy:str(3000)});
}
// A small closed-schema validator, shared by HTTP/provider contracts. No coercion,
// unknown properties, executable content, arbitrary URLs or lifecycle fields.
export function validateSchema(value:unknown,s:Schema):void {
 const types=Array.isArray(s.type)?s.type:[s.type];
 if(value===null){if(!types.includes('null'))throw new Error('AI_SCHEMA');return;}
 const type=Array.isArray(value)?'array':typeof value==='number'&&Number.isSafeInteger(value)?'integer':typeof value;
 if(!types.includes(type)||s.enum&&!s.enum.includes(value))throw new Error('AI_SCHEMA');
 if(typeof value==='string'&&(value.length>(s.maxLength??5000)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)))throw new Error('AI_SCHEMA');
 if(typeof value==='number'&&(value<(s.minimum??0)||value>(s.maximum??100000000)))throw new Error('AI_SCHEMA');
 if(Array.isArray(value)){if(value.length>(s.maxItems??12))throw new Error('AI_SCHEMA');for(const item of value)validateSchema(item,s.items!);}
 else if(typeof value==='object'){
  const v=value as Record<string,unknown>,properties=s.properties||{};
  if(Object.keys(v).some(k=>!Object.hasOwn(properties,k))||(s.required||[]).some(k=>!Object.hasOwn(v,k)))throw new Error('AI_SCHEMA');
  for(const [k,item] of Object.entries(v))validateSchema(item,properties[k]);
 }
}
export function validateOutput(raw:unknown,feature:Feature,categories:string[],facts:Metric[]):AIOutput {
 validateSchema(raw,outputSchema(feature,categories));
 const value=raw as AIOutput,patch=Object.fromEntries(Object.entries(value.patch).filter(([,v])=>v!==null));
 for(const key of ['date_iso','end_at'])if(patch[key])validateDate(patch[key]);
 if(patch.date_iso&&patch.end_at&&Date.parse(String(patch.end_at))<=Date.parse(String(patch.date_iso)))throw new Error('AI_SCHEMA');
 if(patch.timezone)try{new Intl.DateTimeFormat('es',{timeZone:String(patch.timezone)});}catch{throw new Error('AI_SCHEMA');}
 if(Array.isArray(patch.tiers))patch.tiers=patch.tiers.map((t,i)=>{
  for(const key of ['sales_start','sales_end'] as const)if(t[key])validateDate(t[key]);
  if(t.sales_start&&t.sales_end&&Date.parse(t.sales_start)>=Date.parse(t.sales_end))throw new Error('AI_SCHEMA');
  return {...t,id:`proposed_${i+1}`,active:false,visible:true};
 });
 if(typeof patch.capacity==='number'&&Array.isArray(patch.tiers)&&patch.tiers.reduce((n,t)=>n+t.capacity,0)>patch.capacity)throw new Error('AI_SCHEMA');
 for(const entry of [...value.inferences,...value.recommendations])if(entry.metrics.some(k=>!facts.some(f=>f.key===k))||(feature==='analytics'&&!entry.metrics.length))throw new Error('AI_SCHEMA');
 if(feature!=='analytics'&&value.inferences.length)throw new Error('AI_SCHEMA');
 return {...value,patch};
}
function validateDate(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('AI_SCHEMA');
 const [y,m,d]=value.slice(0,10).split('-').map(Number);if(new Date(Date.UTC(y,m-1,d)).getUTCDate()!==d)throw new Error('AI_SCHEMA');
}
