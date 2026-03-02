// apps/web/src/app/(organizer)/organizador/verificar/OrganizerVerifyClient.tsx
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

      // Verificado => va al login (pero quedará bloqueado hasta aprobación admin)
      router.replace("/organizador/login?reason=pending_approval");
    } catch (e: any) {
      setErr(e?.message || "Error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6">
        <h1 className="text-xl font-semibold">Verifica tu cuenta</h1>
        <p className="text-sm text-white/60 mt-1">Ingresa el código de 6 dígitos.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none text-center tracking-[0.35em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="______"
            inputMode="numeric"
          />

          {err ? <div className="text-sm text-red-400">{err}</div> : null}

          <button
            className="w-full rounded-xl bg-white text-black font-medium py-2 disabled:opacity-60"
            disabled={busy || code.length !== 6 || !organizerId}
          >
            {busy ? "Verificando..." : "Confirmar"}
          </button>
        </form>
      </div>
    </main>
  );
}