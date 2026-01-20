"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function SignupClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
      <h1 className="text-2xl font-semibold">Registrarse</h1>
      <p className="mt-1 text-sm text-white/70">
        Crea tu cuenta con email y contraseña.
      </p>

      <div className="mt-6 space-y-3">
        <input
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
          placeholder="Contraseña (mín. 8)"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />

        <input
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
          placeholder="Repite contraseña"
          type="password"
          value={pass2}
          onChange={(e) => setPass2(e.target.value)}
        />

        {err && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-white/80">
            {err}
          </div>
        )}

        <button
          disabled={loading}
          onClick={async () => {
            setErr(null);
            const e = email.trim().toLowerCase();
            if (!isEmail(e)) return setErr("Email inválido.");
            if (pass.length < 8) return setErr("Contraseña muy corta (mínimo 8).");
            if (pass !== pass2) return setErr("Las contraseñas no coinciden.");

            setLoading(true);
            try {
              const r = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: e, password: pass }),
              });
              const data = await r.json().catch(() => null);
              if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);

              router.push("/signin?registered=1");
            } catch (ex: any) {
              setErr(String(ex?.message || ex));
            } finally {
              setLoading(false);
            }
          }}
          className="w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
        >
          {loading ? "Creando..." : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}
