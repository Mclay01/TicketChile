// apps/web/src/app/(organizer)/organizador/login/OrganizerLoginClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function reasonLabel(reason: string) {
  if (reason === "missing") return "Faltan credenciales.";
  if (reason === "invalid") return "Usuario/contraseña inválidos.";
  if (reason === "unverified") return "Debes verificar tu correo antes de ingresar.";
  if (reason === "pending") return "Tu cuenta está pendiente de aprobación por el admin.";
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
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6">
        <h1 className="text-xl font-semibold">Organizador — TicketChile</h1>
        <p className="text-sm text-white/60 mt-1">Acceso privado.</p>

        {banner ? (
          <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-sm text-white/80">
            {banner}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
            placeholder="Usuario (o correo)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />

          <input
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
            placeholder="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {err ? <div className="text-sm text-red-400">{err}</div> : null}

          <button
            className="w-full rounded-xl bg-white text-black font-medium py-2 disabled:opacity-60"
            disabled={!canSubmit}
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-white/60">
          <Link href="/organizador/registro" className="hover:text-white">
            Crear cuenta
          </Link>
          <Link href="/eventos" className="hover:text-white">
            ← volver a eventos
          </Link>
        </div>
      </div>
    </main>
  );
}