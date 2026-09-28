'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import AuthShell from '@/components/tc/AuthShell';
import { Button, Notice } from '@/components/tc/ui';
type Result={title?:string;tier?:string;expiresAt?:string;ticketId?:string;error?:string;code?:string};
export default function TransferClaim() {
  const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(true),started=useRef(false),heading=useRef<HTMLHeadingElement>(null);
  async function call(action:string,token?:string) {const r=await fetch('/api/tickets/transfer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,token})});return r.json();}
  useEffect(()=>{
    async function start(){setBusy(true);setResult(null);try{const token=location.hash.slice(1);if(token){const staged=await call('stage',token);if(staged.error){setResult(staged);return;}history.replaceState(null,'','/transferir');}setResult(await call('inspect'));}catch{setResult({error:'No pudimos conectar. Recarga para reintentar.'});}finally{setBusy(false);}}
    const changed=()=>{void start();};window.addEventListener('hashchange',changed);
    if(!started.current){started.current=true;void start();}
    return ()=>window.removeEventListener('hashchange',changed);
  },[]);
  async function accept(){setBusy(true);try{setResult(await call('accept'));}catch{setResult({error:'No pudimos confirmar. Recarga para consultar el estado.'});}finally{setBusy(false);heading.current?.focus();}}
  return <AuthShell><div className="stack"><p className="eyebrow">Transferencia de entrada</p><h1 ref={heading} tabIndex={-1}>{result?.ticketId?'La entrada ya es tuya':'Recibe tu próxima experiencia'}</h1>{busy&&<p role="status">Comprobando invitación…</p>}{result?.code==='UNAUTHENTICATED'?<><Notice>Ingresa con el correo que recibió la invitación. Si aún no tienes cuenta, créala y verifica ese correo. Tu invitación se conservará en este navegador.</Notice><Link className="btn" href="/signin?callbackUrl=/transferir">Ingresar para continuar</Link><Link className="btn secondary" href="/signup?callbackUrl=/transferir">Crear cuenta</Link></>:result?.ticketId?<><Notice>Transferencia aceptada. Tienes un QR nuevo; el anterior quedó revocado.</Notice><Link className="btn" href={`/mis-tickets/${result.ticketId}`}>Ver mi entrada</Link></>:result?.error?<><Notice error>{result.error}</Notice>{result.code==='WRONG_RECIPIENT'&&<Button variant="secondary" onClick={()=>signOut({callbackUrl:'/signin?callbackUrl=/transferir'})}>Cambiar de cuenta</Button>}<Link href="/mis-tickets">Volver a mis tickets</Link></>:result?.title?<><h2>{result.title}</h2><p>{result.tier}</p><p className="hint">Vence: {new Date(result.expiresAt!).toLocaleString('es-CL')}</p><p>Al aceptar, recibirás la titularidad y un QR nuevo. El remitente perderá el acceso con su entrada anterior.</p><Button disabled={busy} onClick={accept}>Aceptar entrada</Button></>:null}</div></AuthShell>;
}
