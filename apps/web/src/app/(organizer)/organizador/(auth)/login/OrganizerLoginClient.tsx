// apps/web/src/app/(organizer)/organizador/(auth)/login/OrganizerLoginClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function reasonLabel(reason: string) {
  if (reason === "missing") return "Te falta sesión. Inicia sesión para continuar.";
  if (reason === "invalid") return "Sesión inválida o expirada. Vuelve a iniciar sesión.";
  if (reason === "unverified") return "Debes verificar tu correo antes de ingresar.";
  if (reason === "pending") return "Tu cuenta está pendiente de aprobación por el admin.";
  if (reason === "logged_out") return "Sesión cerrada.";
  if (reason === "error") return "Error interno. Intenta de nuevo.";
  return "";
}

export default function OrganizerLoginClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const from = useMemo(() => {
    const fromRaw = sp.get("from") || "/organizador";
    return fromRaw.startsWith("/organizador") ? fromRaw : "/organizador";
  }, [sp]);

  const reason = sp.get("reason") || "";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const banner = reasonLabel(reason);
  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setErr(null);
    setBusy(true);

    try {
      const payload = {
        username: username.trim().toLowerCase(),
        password,
        from,
      };

      const r = await fetch("/api/organizador/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "No se pudo iniciar sesión.");

      router.replace(from);
    } catch (e: any) {
      setErr(e?.message || "Error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[72vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Panel Organizador</h1>
          <p className="text-sm text-white/60">Acceso privado a tus eventos, pagos y scanner.</p>
        </div>

        {banner ? (
          <div className="mb-4 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80">
            {banner}
          </div>
        ) : null}

        <div className="rounded-xl border border-black/10 bg-white p-6 text-black shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-black/70">Usuario o correo</label>
              <input
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Ej: productorax"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-black/70">Contraseña</label>
              <input
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Tu contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {err ? <div className="text-sm text-red-600">{err}</div> : null}

            <button
              className="w-full rounded-lg bg-black py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={!canSubmit}
            >
              {busy ? "Entrando..." : "Entrar"}
            </button>

            <div className="pt-2 flex items-center justify-between text-xs text-black/60">
              <Link href="/organizador/registro" className="hover:text-black">
                Crear cuenta
              </Link>
              <Link href="/eventos" className="hover:text-black">
                ← volver a eventos
              </Link>
            </div>
          </form>
        </div>

        <p className="mt-4 text-[11px] text-white/40">
          Tip: si te manda a “sesión inválida”, es porque el cookie existe pero la sesión ya no está en DB (cookie zombie).
        </p>
      </div>
    </main>
  );
}