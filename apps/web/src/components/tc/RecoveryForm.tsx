"use client";
import Link from "next/link";
import { useState } from "react";
import AuthShell from "./AuthShell";
import { Button, Field, Notice } from "./ui";
export default function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form); setError("");
    if (reset && data.get("password") !== data.get("confirm")) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try { const response = await fetch(`/api/security/${reset ? "reset" : "recovery"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "BUYER", login: String(data.get("email") || "").trim().toLowerCase(), token: data.get("token"), password: data.get("password") }) });
      if (!response.ok) setError(reset ? "No pudimos cambiar la contraseña. Revisa el token o solicita uno nuevo." : "No pudimos completar la solicitud. Intenta más tarde."); else { setDone(true); form.reset(); }
    } catch { setError("No pudimos conectar. Intenta nuevamente."); } finally { setBusy(false); }
  }
  return <AuthShell><div className="stack-sm"><p className="eyebrow">Seguridad de tu cuenta</p><h1>{reset ? "Nueva contraseña" : "Recupera tu acceso"}</h1><p className="muted">{reset ? "Usa el token recibido para definir tu nueva contraseña." : "Indica el correo de tu cuenta. Te enviaremos instrucciones si corresponde."}</p></div>{done ? <Notice>{reset ? "Tu contraseña fue actualizada. Inicia sesión nuevamente." : "Si la cuenta puede recuperar acceso, recibirás las instrucciones. Revisa también el correo no deseado."}</Notice> : <form className="stack" onSubmit={submit}>{reset ? <><Field label="Token de recuperación"><input name="token" autoComplete="off" required maxLength={512} /></Field><Field label="Nueva contraseña" hint="Al menos 12 caracteres."><input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></Field><Field label="Repite tu contraseña"><input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></Field></> : <Field label="Correo electrónico"><input name="email" type="email" autoComplete="email" required maxLength={254} /></Field>}{error && <Notice error>{error}</Notice>}<Button disabled={busy}>{busy ? "Enviando…" : reset ? "Guardar contraseña" : "Enviar instrucciones"}</Button></form>}{!reset && <Link href="/nueva-contrasena">Ya tengo un token de recuperación</Link>}<Link href="/signin">← Volver a ingresar</Link></AuthShell>;
}
