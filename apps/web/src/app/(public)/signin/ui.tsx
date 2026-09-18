"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/components/tc/AuthShell";
import { Button, Field, Notice } from "@/components/tc/ui";
export default function SignInClient({ googleAvailable = false }: { googleAvailable?: boolean }) {
  const router = useRouter(), params = useSearchParams();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const raw = params.get("callbackUrl") || "";
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") && !/[\\\r\n]/.test(raw) && !/^\/(organizador|api|admin)/.test(raw) ? raw : "/mis-tickets";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await signIn("credentials", { redirect: false, email: String(data.get("email")).trim().toLowerCase(), password: data.get("password"), code: data.get("code"), callbackUrl });
      if (!result || result.error) setError("No pudimos iniciar sesión. Revisa tus datos y la verificación de tu correo.");
      else { router.push(callbackUrl); router.refresh(); }
    } catch { setError("No pudimos conectar. Intenta nuevamente."); } finally { setBusy(false); }
  }
  return <AuthShell><div className="stack-sm"><p className="eyebrow">Bienvenido de vuelta</p><h1>Ingresa a tu cuenta</h1><p className="muted">Tus entradas y próximos planes te esperan.</p></div>{params.get("verified") === "1" && <Notice>Tu correo fue verificado. Ya puedes ingresar.</Notice>}
    <form onSubmit={submit} className="stack"><Field label="Correo electrónico"><input name="email" type="email" autoComplete="username" required maxLength={254} placeholder="tu@correo.cl" /></Field><Field label="Contraseña"><input name="password" type="password" autoComplete="current-password" required maxLength={256} /></Field><details><summary className="hint" style={{ cursor: "pointer" }}>Tengo autenticación en dos pasos</summary><Field label="Código TOTP o de recuperación"><input name="code" autoComplete="one-time-code" maxLength={100} /></Field></details><Link className="hint" href="/recuperar">¿Olvidaste tu contraseña?</Link>{error && <Notice error>{error}</Notice>}<Button disabled={busy}>{busy ? "Ingresando…" : "Ingresar →"}</Button></form><p className="muted">¿Aún no tienes cuenta? <Link href="/signup">Crea tu cuenta</Link></p><Link className="hint" href="/security?kind=BUYER&operation=verify-resend">Volver a solicitar verificación de correo</Link>
    {googleAvailable && <Button variant="secondary" disabled={busy} onClick={() => { setBusy(true); signIn("google", { callbackUrl }).catch(() => { setError("No pudimos conectar con Google."); setBusy(false); }); }}>Continuar con Google</Button>}
  </AuthShell>;
}
