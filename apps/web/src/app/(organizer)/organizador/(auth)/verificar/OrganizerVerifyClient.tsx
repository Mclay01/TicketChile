// apps/web/src/app/(organizer)/organizador/(auth)/verificar/OrganizerVerifyClient.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OrganizerVerifyClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const organizerId = sp.get("organizerId") || "";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/organizador/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizerId, code }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "No se pudo verificar.");

      router.replace("/organizador/login?reason=pending");
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
          <h1 className="text-2xl font-semibold tracking-tight text-white">Verificación</h1>
          <p className="text-sm text-white/60">Ingresa el código de 6 dígitos.</p>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 text-black shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-black/70">Código</label>
              <input
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-center tracking-[0.35em] outline-none focus:ring-2 focus:ring-black/10"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="______"
                inputMode="numeric"
              />
            </div>

            {err ? <div className="text-sm text-red-600">{err}</div> : null}

            <button
              className="w-full rounded-lg bg-black py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={busy || code.length !== 6 || !organizerId}
            >
              {busy ? "Verificando..." : "Confirmar"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}