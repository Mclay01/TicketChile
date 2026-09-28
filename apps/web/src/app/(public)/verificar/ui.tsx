'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthShell from '@/components/tc/AuthShell';
import { Button, Field, Notice } from '@/components/tc/ui';
export default function Verify() {
  const transfer=useSearchParams().get('callbackUrl')==='/transferir';
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
  async function submit(e:React.FormEvent<HTMLFormElement>,resend=false) {
    e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setMessage('');
    try {const r=await fetch(resend?'/api/security/verify-resend':'/api/auth/verify-email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'BUYER',token:f.get('token'),login:f.get('email')})});const b=await r.json();setError(!r.ok);setMessage(r.ok?resend?'Solicitud recibida. Si corresponde, recibirás un correo.':'Correo verificado. Ya puedes ingresar.':b.error||'No pudimos verificar. Revisa el código.');}catch{setError(true);setMessage('No pudimos conectar. Intenta nuevamente.');}finally{setBusy(false);}
  }
  return <AuthShell><div className="stack"><h1>Verifica tu correo</h1><p>Ingresa el código recibido. La invitación de transferencia se conserva en este navegador.</p><form className="stack" onSubmit={e=>submit(e)}><Field label="Código de verificación"><input name="token" autoComplete="one-time-code" maxLength={200} required /></Field><Button disabled={busy}>Verificar correo</Button></form><details><summary>No recibí el correo</summary><form className="stack" onSubmit={e=>submit(e,true)}><Field label="Correo electrónico"><input name="email" type="email" autoComplete="email" required maxLength={254} /></Field><Button disabled={busy} variant="secondary">Solicitar nuevo código</Button></form></details>{message&&<Notice error={error}>{message}</Notice>}<Link className="btn secondary" href={transfer?'/signin?callbackUrl=/transferir':'/signin'}>Ingresar</Link></div></AuthShell>;
}
