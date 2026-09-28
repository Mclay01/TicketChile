'use client';
import { useState } from 'react';
import { Button, Field, Notice } from './ui';
export default function ProfileForm({name,phone}:{name:string;phone:string}) {
  const [busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState(false);
  async function save(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setResult('');const f=new FormData(e.currentTarget);
    try { const r=await fetch('/api/account/profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.get('name'),phone:f.get('phone')})}); const b=await r.json();setError(!r.ok);setResult(r.ok?'Tus datos fueron guardados.':b.error); }
    catch {setError(true);setResult('No pudimos guardar. Intenta nuevamente.');}finally{setBusy(false);}
  }
  return <form className="stack" onSubmit={save}><Field label="Nombre"><input name="name" autoComplete="name" defaultValue={name} minLength={2} maxLength={100} required /></Field><Field label="Teléfono" hint="Opcional. Incluye el código de país."><input name="phone" type="tel" autoComplete="tel" defaultValue={phone} maxLength={30} /></Field>{result&&<Notice error={error}>{result}</Notice>}<Button disabled={busy}>{busy?'Guardando…':'Guardar cambios'}</Button></form>;
}
