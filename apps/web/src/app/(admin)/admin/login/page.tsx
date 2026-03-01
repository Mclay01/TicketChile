// apps/web/src/app/(admin)/admin/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const from = sp.get("from") || "/admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, from }),
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
        <h1 className="text-xl font-semibold">Admin — TicketChile</h1>
        <p className="text-sm text-white/60 mt-1">Acceso privado.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
            placeholder="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
            placeholder="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {err ? <div className="text-sm text-red-400">{err}</div> : null}

          <button
            className="w-full rounded-xl bg-white text-black font-medium py-2 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}