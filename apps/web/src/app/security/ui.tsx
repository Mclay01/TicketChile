"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
export default function SecurityForm(){
  const params=useSearchParams();
  const [kind,setKind]=useState(params.get("kind")||"BUYER");
  const [operation,setOperation]=useState(params.get("operation")||"mfa");
  const [action,setAction]=useState("begin");
  const [login,setLogin]=useState("");
  const [password,setPassword]=useState("");
  const [code,setCode]=useState("");
  const [token,setToken]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<{message?:string;secret?:string;uri?:string;recoveryCodes?:string[];relogin?:boolean;error?:string}|null>(null);
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setResult(null);
    try{
      const url=operation==="verify-email"?(kind==="ORGANIZER"?"/api/organizador/verify":"/api/auth/verify-email"):`/api/security/${operation}`;
      const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,action,login,password,code,token})});
      const data=await response.json();
      setResult(response.ok?{message:"Solicitud completada.",...data}:{error:data.error||"No se pudo completar."});
      setPassword("");setCode("");
      if(response.ok&&operation==="mfa"&&action==="begin")setAction("confirm");
    }catch{setResult({error:"No se pudo completar. Intenta nuevamente."});}finally{setBusy(false);}
  }
  const input="block w-full rounded border border-white/20 bg-black p-2";
  return <main className="mx-auto max-w-lg space-y-4 px-4 py-10">
    <h1 className="text-2xl font-semibold">Seguridad de tu cuenta</h1>
    <p>Administradores y organizadores deben activar un autenticador TOTP antes de acceder al panel.</p>
    <form onSubmit={submit} className="space-y-3">
      <label className="block">Cuenta<select className={input} value={kind} onChange={e=>setKind(e.target.value)}>
        <option value="BUYER">Comprador / staff</option><option value="ORGANIZER">Organizador</option><option value="ADMIN">Administrador</option>
      </select></label>
      <label className="block">Operacion<select className={input} value={operation} onChange={e=>{setOperation(e.target.value);setResult(null);}}>
        <option value="mfa">Autenticador</option><option value="recovery">Recuperar acceso</option><option value="reset">Cambiar clave con token</option><option value="verify-email">Verificar correo</option><option value="verify-resend">Solicitar nueva verificacion</option><option value="invite-accept">Aceptar invitacion de staff</option>
      </select></label>
      {operation==="mfa"&&<label className="block">Accion<select className={input} value={action} onChange={e=>setAction(e.target.value)}>
        <option value="begin">Configurar / reconfigurar</option><option value="confirm">Confirmar configuracion</option><option value="verify">Verificar codigo</option><option value="disable">Desactivar</option><option value="status">Consultar estado</option>
      </select></label>}
      {["recovery","verify-resend"].includes(operation)&&<label className="block">Usuario o correo<input className={input} value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required /></label>}
      {(operation==="reset"||operation==="mfa"&&(action==="begin"||action==="disable"))&&<label className="block">{operation==="reset"?"Nueva clave (minimo 12 caracteres)":"Clave actual"}<input className={input} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={operation==="reset"?"new-password":"current-password"} required /></label>}
      {operation==="mfa"&&action!=="status"&&<label className="block">Codigo TOTP o de recuperacion<input className={input} value={code} onChange={e=>setCode(e.target.value)} autoComplete="one-time-code" /><span className="text-sm">Al configurar por primera vez, deja el codigo vacio. Luego confirma con el codigo de tu autenticador.</span></label>}
      {["reset","verify-email","invite-accept"].includes(operation)&&<label className="block">Token recibido<input className={input} value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" required /></label>}
      <button disabled={busy} className="rounded bg-white px-4 py-2 text-black">{busy?"Procesando...":"Continuar"}</button>
    </form>
    {result&&<div role="status" className="space-y-2 break-all">
      <p>{result.error||result.message}</p>
      {result.secret&&<p>Agrega esta clave a tu autenticador: <code>{result.secret}</code></p>}
      {result.uri&&<a className="underline" href={result.uri}>Abrir autenticador</a>}
      {result.recoveryCodes&&<><p>Guarda estos codigos en un lugar seguro. Cada uno sirve una sola vez y no volveran a mostrarse.</p><pre>{result.recoveryCodes.join("\n")}</pre></>}
      {result.relogin&&<p>Inicia sesion nuevamente con tu clave y autenticador.</p>}
    </div>}
    <p><Link className="underline" href={kind==="ADMIN"?"/admin/login":kind==="ORGANIZER"?"/organizador/login":"/signin"}>Volver a iniciar sesion</Link></p>
  </main>;
}
