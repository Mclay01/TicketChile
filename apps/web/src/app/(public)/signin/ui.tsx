"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignInClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const verified = sp.get("verified") === "1";
  const verifiedBad = sp.get("verified") === "0";
  const registered = sp.get("registered") === "1";
  const mailFailed = sp.get("mail") === "0";

  const callbackUrl = useMemo(() => {
    const raw = sp.get("callbackUrl");
    if (raw && raw.startsWith("/")) return raw; // evita open-redirect
    return "/mis-tickets";
  }, [sp]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const cleanEmail = email.trim().toLowerCase();

    const res = await signIn("credentials", {
      redirect: false,
      email: cleanEmail,
      password,
      callbackUrl,
    });

    setBusy(false);

    if (!res || res.error) {
      setMsg("Email/contraseña inválidos o email no verificado.");
      return;
    }

    // Mantengo tu UX: ir directo a mis-tickets con el email en query (demo)
    router.push(`/mis-tickets?email=${encodeURIComponent(cleanEmail)}`);
  }

  async function onGoogle() {
    setBusy(true);
    setMsg(null);
    // en NextAuth v4, signIn con redirect true (default) es lo normal
    await signIn("google", { callbackUrl });
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur">
        <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-white/70">
          Entra con tu cuenta para ver tus tickets.
        </p>

        {registered && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
            Cuenta creada.{" "}
            {mailFailed ? (
              <>
                No se pudo enviar el correo de confirmación (config). Igual tu cuenta está creada.
                Si necesitas, vuelve a intentar más tarde.
              </>
            ) : (
              <>Revisa tu correo para confirmar y luego inicia sesión.</>
            )}
          </div>
        )}

        {verified && (
          <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-white/80">
            Listo: tu correo fue confirmado. Ya puedes iniciar sesión.
          </div>
        )}

        {verifiedBad && (
          <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-white/80">
            El link de verificación no es válido o expiró. Regístrate de nuevo o pide un nuevo link.
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-white/80">
            {msg}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/40"
            required
          />

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            type="password"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/40"
            required
          />

          <button
            disabled={busy}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-white/50">o</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          onClick={onGoogle}
          disabled={busy}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-60"
        >
          Continuar con Google
        </button>

        <p className="mt-4 text-sm text-white/60">
          ¿No tienes cuenta?{" "}
          <Link href="/signup" className="text-white underline">
            Registrarse
          </Link>
        </p>
      </div>
    </div>
  );
}
