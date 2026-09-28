'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export type ActionField={name:string;label:string;type?:'text'|'number'|'datetime-local'|'checkbox';options?:string[];required?:boolean};
export default function Action({action,target,label,description,fields=[],values={}}:{action:string;target:string;label:string;description:string;fields?:ActionField[];values?:Record<string,unknown>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[key,setKey]=useState('');const router=useRouter();
 return <section className="admin-action"><button className="btn secondary" onClick={()=>{setOpen(!open);if(!key)setKey(crypto.randomUUID());}} aria-expanded={open}>{label}</button>{open&&<form className="stack" onSubmit={async event=>{
  event.preventDefault();const data=new FormData(event.currentTarget),body:Record<string,unknown>={action,target,requestKey:key,...values};
  for(const [k,v] of data)body[k]=String(v);
  for(const f of fields){if(f.type==='number')body[f.name]=Number(data.get(f.name));if(f.type==='checkbox')body[f.name]=data.get(f.name)==='on';if(f.type==='datetime-local'&&body[f.name])body[f.name]=new Date(String(body[f.name])).toISOString();}
  setBusy(true);setError('');try{const response=await fetch('/api/admin/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo completar.');setDone(true);router.refresh();}catch(e){setError(e instanceof Error?e.message:'Error de conexión.');}finally{setBusy(false);}
 }}><p>{description}</p>{fields.map(f=><label className="field" key={f.name}><span>{f.label}</span>{f.options?<select name={f.name} required={f.required!==false}>{f.options.map(o=><option key={o}>{o}</option>)}</select>:<input name={f.name} type={f.type||'text'} required={f.type==='checkbox'||f.required!==false} maxLength={f.name==='note'?2000:500}/>}</label>)}<label className="field"><span>Motivo interno</span><textarea name="reason" required maxLength={500}/></label><label className="field"><span>Confirmación: escribe <strong>{action} {target}</strong></span><input name="confirmation" required autoComplete="off"/></label>{error&&<p role="alert" className="notice danger">{error}</p>}{done?<p role="status">Operación registrada. Revisa el estado actualizado.</p>:<button className="btn primary" disabled={busy}>{busy?'Registrando…':'Confirmar operación'}</button>}</form>}</section>;
}
