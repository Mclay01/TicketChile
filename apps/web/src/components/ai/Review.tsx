'use client';
import {useState} from 'react';
import {Button,Field,Notice} from '@/components/tc/ui';
import {criticalFields,fieldNames,type Proposal} from '@/lib/ai/model';
import type {Draft,Tier} from '@/lib/organizer/model';
function TierSuggestions({value,onChange}:{value:string;onChange:(v:string)=>void}){
 const tiers=JSON.parse(value) as Tier[];
 function change(index:number,key:keyof Tier,v:string|number|null){onChange(JSON.stringify(tiers.map((t,i)=>i===index?{...t,[key]:v}:t)));}
 return <div className="stack"><p className="eyebrow">Propuesto · editable</p>{tiers.map((t,i)=><fieldset className="stack-sm" key={t.id}><legend>Entrada {i+1} · inactiva</legend>{(['name','description','price_clp','capacity','max_per_order','sales_start','sales_end'] as const).map(k=><Field key={k} label={{name:'Nombre',description:'Descripción',price_clp:'Precio CLP',capacity:'Stock',max_per_order:'Máximo por compra',sales_start:'Inicio de venta (ISO con zona)',sales_end:'Fin de venta (ISO con zona)'}[k]}><input type={['price_clp','capacity','max_per_order'].includes(k)?'number':'text'} value={t[k]??''} onChange={e=>change(i,k,['price_clp','capacity','max_per_order'].includes(k)?Number(e.target.value):['sales_start','sales_end'].includes(k)&&!e.target.value?null:e.target.value)}/></Field>)}</fieldset>)}</div>;
}
function currentValue(draft:Draft,key:string){
 if(key==='tiers')return draft.tiers.length?draft.tiers.map(t=>`${t.name}: $${t.price_clp.toLocaleString('es-CL')} CLP · ${t.capacity} cupos · máximo ${t.max_per_order} por compra${t.sales_start?` · desde ${t.sales_start}`:''}${t.sales_end?` · hasta ${t.sales_end}`:''}`).join('\n'):'Sin tipos de entrada';
 const value=draft[key as keyof Draft];return typeof value==='string'?value||'Sin completar':JSON.stringify(value,null,2);
}
export default function Review({proposal,current,busy,onApply,onReject}:{proposal:Proposal;current:Draft;busy:boolean;onApply:(patch:Record<string,unknown>,confirmed:boolean)=>Promise<void>;onReject:()=>void}){
 const [accepted,setAccepted]=useState<string[]>([]),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(Object.entries(proposal.patch).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v,null,2)])));
 const [copy,setCopy]=useState(proposal.copy);
 const sensitive=accepted.some(k=>criticalFields.includes(k));
 async function apply(){try{setError('');const patch=Object.fromEntries(accepted.map(k=>[k,['capacity','tiers'].includes(k)?JSON.parse(values[k]):values[k]]));await onApply(patch,confirmed);}catch{setError('Revisa los números y la estructura de entradas antes de continuar.');}}
 return <section className="stack ai-review" aria-label="Revisar propuesta"><div><p className="eyebrow">Propuesta · {proposal.source==='LOCAL_RULES'?'Reglas locales / desarrollo':'Generada con IA'}</p><h2 tabIndex={-1}>Revisa antes de aplicar</h2><p className="hint">{Object.keys(proposal.patch).length} campos propuestos · {accepted.length} seleccionados. Los valores propuestos todavía no están confirmados.</p></div>
 {proposal.warnings.map((w,i)=><Notice key={i}>{w}</Notice>)}
 {proposal.facts.length>0&&<section className="stack-sm"><h3>Hechos · datos del evento</h3>{proposal.facts.map(f=><div className="history-row" key={f.key}><span>{f.label}</span><strong className="mono">{f.value.toLocaleString('es-CL')} {f.unit}</strong></div>)}</section>}
 {([['Inferencias · hipótesis',proposal.inferences],['Recomendaciones · por revisar',proposal.recommendations]] as const).map(([title,rows])=>rows.length>0&&<section className="stack-sm" key={title}><h3>{title}</h3>{rows.map((r,i)=><div className="panel" key={i}><p>{r.text}</p>{r.metrics.length>0&&<p className="hint">Basado en: {r.metrics.map(k=>proposal.facts.find(f=>f.key===k)?.label).join(' · ')}</p>}</div>)}</section>)}
 {Object.keys(proposal.patch).map(k=><section className="panel stack" key={k}><h3>{fieldNames[k]||k}</h3><div className="ai-diff"><div><p className="eyebrow">Actual</p><pre>{currentValue(current,k)}</pre></div>{k==='tiers'?<TierSuggestions value={values[k]} onChange={value=>{setValues(v=>({...v,[k]:value}));setConfirmed(false);}}/>:<Field label="Propuesto · editable"><textarea rows={4} value={values[k]} onChange={e=>{setValues(v=>({...v,[k]:e.target.value}));setConfirmed(false);}}/></Field>}</div><Field label={`Aceptar ${fieldNames[k]||k}`}><input type="checkbox" checked={accepted.includes(k)} onChange={e=>{setAccepted(a=>e.target.checked?[...a,k]:a.filter(x=>x!==k));setConfirmed(false);}}/></Field>{criticalFields.includes(k)&&<p className="hint">Valor sensible: requiere tu confirmación explícita.</p>}</section>)}
 {copy&&<Field label="Borrador editable · no se envía ni activa"><textarea rows={7} value={copy} onChange={e=>setCopy(e.target.value)}/></Field>}
 {proposal.missing.length>0&&<div><h3>Información pendiente de confirmar</h3><ul>{proposal.missing.map((m,i)=><li key={i}>{m}</li>)}</ul></div>}
 {sensitive&&<div className="panel stack-sm"><h3>Confirmar valores sensibles</h3><p>Se aplicarán a este borrador: {accepted.filter(k=>criticalFields.includes(k)).map(k=>fieldNames[k]).join(', ')}. Las nuevas entradas permanecerán inactivas. Revisa el valor actual y el propuesto de cada campo.</p><Field label="Confirmo los valores sensibles seleccionados para este evento"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/></Field></div>}
 {error&&<Notice error>{error}</Notice>}<div className="row">{Object.keys(proposal.patch).length>0&&<Button disabled={busy||!accepted.length||sensitive&&!confirmed} onClick={()=>void apply()}>Aplicar campos seleccionados</Button>}<Button variant="quiet" disabled={busy} onClick={onReject}>Rechazar propuesta</Button></div></section>;
}
