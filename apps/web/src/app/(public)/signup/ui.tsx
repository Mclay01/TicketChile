"use client";
import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/tc/AuthShell";
import { Button, Field, Notice } from "@/components/tc/ui";
export default function SignupClient() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); setError("");
    if (data.get("password") !== data.get("confirm")) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try { const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: String(data.get("email")).trim().toLowerCase(), password: data.get("password") }) });
      if (!response.ok) setError("No pudimos completar la solicitud. Revisa los datos o intenta más tarde."); else setSent(true);
    } catch { setError("No pudimos conectar. Intenta nuevamente."); } finally { setBusy(false); }
  }
  return <AuthShell><div className="stack-sm"><p className="eyebrow">Tu próxima experiencia</p><h1>Crea tu cuenta</h1><p className="muted">Un lugar para tus entradas y tus encuentros.</p></div>{sent ? <div className="stack"><Notice>Solicitud recibida. Si corresponde, recibirás las instrucciones para verificar tu correo.</Notice><Link className="btn" href="/security?kind=BUYER&operation=verify-email">Verificar mi correo</Link><Link href="/signin">Volver a ingresar</Link></div> : <form onSubmit={submit} className="stack"><Field label="Correo electrónico"><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="tu@correo.cl" /></Field><Field label="Contraseña" hint="Usa al menos 12 caracteres."><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></Field><Field label="Repite tu contraseña"><input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></Field><p className="hint">Consulta la información de <Link href="/legal/privacidad">privacidad</Link> y los <Link href="/legal/terminos">términos del servicio</Link>.</p>{error && <Notice error>{error}</Notice>}<Button disabled={busy}>{busy ? "Enviando…" : "Crear cuenta →"}</Button><p className="muted">¿Ya tienes cuenta? <Link href="/signin">Ingresar</Link></p></form>}</AuthShell>;
}
