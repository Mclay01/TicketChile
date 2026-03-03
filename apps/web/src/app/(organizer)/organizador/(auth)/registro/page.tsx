// apps/web/src/app/(organizer)/organizador/registro/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  orgType: "persona" | "empresa";
  legalName: string;
  rut: string;
  displayName: string;
  email: string;
  phone: string;
  channel: "email" | "whatsapp";
  password: string;
  password2: string;
};

export default function OrganizerRegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [v, setV] = useState<FormState>({
    orgType: "empresa",
    legalName: "",
    rut: "",
    displayName: "",
    email: "",
    phone: "",
    channel: "email",
    password: "",
    password2: "",
  });

  const steps = useMemo(
    () => [
      { key: "orgType", title: "¿Eres persona o empresa?" },
      { key: "legalName", title: "Nombre legal" },
      { key: "rut", title: "RUT" },
      { key: "displayName", title: "Nombre público (cómo se verá)" },
      { key: "email", title: "Correo" },
      { key: "channel", title: "¿Dónde quieres recibir el código?" },
      { key: "phone", title: "Teléfono (WhatsApp)" },
      { key: "password", title: "Crea tu contraseña" },
      { key: "password2", title: "Confirma tu contraseña" },
    ],
    []
  );

  const progress = Math.round(((step + 1) / steps.length) * 100);

  function canGoNext() {
    if (step === 0) return true;
    if (step === 1) return v.legalName.trim().length >= 3;
    if (step === 2) return v.rut.trim().length >= 8;
    if (step === 3) return v.displayName.trim().length >= 2;
    if (step === 4) return v.email.includes("@");
    if (step === 5) return true;

    // phone solo si eligió whatsapp
    if (step === 6) return v.channel === "email" ? true : v.phone.trim().length >= 8;

    if (step === 7) return v.password.trim().length >= 8;

    if (step === 8) {
      const p1 = v.password.trim();
      const p2 = v.password2.trim();
      return p2.length >= 8 && p1 === p2;
    }

    return true;
  }

  function next() {
    if (!canGoNext()) return;
    setErr(null);
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function prev() {
    setErr(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      // no mandamos password2 "porque sí", solo para validar backend (si quieres, lo mandamos igual)
      const payload = { ...v };
      if (payload.channel === "email") payload.phone = "";

      const r = await fetch("/api/organizador/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "No se pudo registrar.");

      router.push(`/organizador/verificar?organizerId=${encodeURIComponent(j.organizerId)}`);
    } catch (e: any) {
      setErr(e?.message || "Error.");
    } finally {
      setBusy(false);
    }
  }

  const passwordMismatch =
    step === 8 &&
    v.password2.length > 0 &&
    v.password.trim().length >= 1 &&
    v.password2.trim() !== v.password.trim();

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-black/40 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Registro Organizador</h1>
          <div className="text-xs text-white/60">{progress}%</div>
        </div>

        <div className="mt-3 h-1 w-full bg-white/10 rounded">
          <div className="h-1 bg-white rounded" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-6">
          <div className="text-sm text-white/70">{steps[step].title}</div>

          <div className="mt-3">
            {step === 0 ? (
              <div className="flex gap-2">
                <button
                  className={`flex-1 rounded-xl border border-white/10 px-3 py-2 ${
                    v.orgType === "persona" ? "bg-white text-black" : "bg-white/5"
                  }`}
                  onClick={() => setV((x) => ({ ...x, orgType: "persona" }))}
                  type="button"
                >
                  Persona
                </button>
                <button
                  className={`flex-1 rounded-xl border border-white/10 px-3 py-2 ${
                    v.orgType === "empresa" ? "bg-white text-black" : "bg-white/5"
                  }`}
                  onClick={() => setV((x) => ({ ...x, orgType: "empresa" }))}
                  type="button"
                >
                  Empresa
                </button>
              </div>
            ) : null}

            {step === 1 ? (
              <input
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
                value={v.legalName}
                onChange={(e) => setV((x) => ({ ...x, legalName: e.target.value }))}
                placeholder="Ej: Productora X SpA"
              />
            ) : null}

            {step === 2 ? (
              <input
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
                value={v.rut}
                onChange={(e) => setV((x) => ({ ...x, rut: e.target.value }))}
                placeholder="Ej: 12.345.678-9"
              />
            ) : null}

            {step === 3 ? (
              <input
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
                value={v.displayName}
                onChange={(e) => setV((x) => ({ ...x, displayName: e.target.value }))}
                placeholder="Ej: TicketChile Lab"
              />
            ) : null}

            {step === 4 ? (
              <input
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
                value={v.email}
                onChange={(e) => setV((x) => ({ ...x, email: e.target.value }))}
                placeholder="correo@dominio.com"
                autoComplete="email"
              />
            ) : null}

            {step === 5 ? (
              <div className="space-y-2">
                <button
                  className={`w-full rounded-xl border border-white/10 px-3 py-2 ${
                    v.channel === "email" ? "bg-white text-black" : "bg-white/5"
                  }`}
                  onClick={() => setV((x) => ({ ...x, channel: "email" }))}
                  type="button"
                >
                  Email (recomendado)
                </button>

                <button
                  className={`w-full rounded-xl border border-white/10 px-3 py-2 ${
                    v.channel === "whatsapp" ? "bg-white text-black" : "bg-white/5"
                  }`}
                  onClick={() => setV((x) => ({ ...x, channel: "whatsapp" }))}
                  type="button"
                >
                  WhatsApp
                </button>

                <div className="text-xs text-white/50">
                  WhatsApp requiere configuración del proveedor. Si no está listo, el sistema te pedirá usar Email.
                </div>
              </div>
            ) : null}

            {step === 6 ? (
              v.channel === "email" ? (
                <div className="text-sm text-white/60">No necesitas teléfono si eliges Email.</div>
              ) : (
                <input
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
                  value={v.phone}
                  onChange={(e) => setV((x) => ({ ...x, phone: e.target.value }))}
                  placeholder="+569XXXXXXXX"
                  autoComplete="tel"
                />
              )
            ) : null}

            {step === 7 ? (
              <input
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
                value={v.password}
                onChange={(e) => setV((x) => ({ ...x, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                type="password"
                autoComplete="new-password"
              />
            ) : null}

            {step === 8 ? (
              <>
                <input
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
                  value={v.password2}
                  onChange={(e) => setV((x) => ({ ...x, password2: e.target.value }))}
                  placeholder="Repite tu contraseña"
                  type="password"
                  autoComplete="new-password"
                />
                {passwordMismatch ? (
                  <div className="mt-2 text-xs text-red-400">Las contraseñas no coinciden.</div>
                ) : (
                  <div className="mt-2 text-xs text-white/50">Deben ser iguales.</div>
                )}
              </>
            ) : null}
          </div>

          {err ? <div className="mt-3 text-sm text-red-400">{err}</div> : null}

          <div className="mt-6 flex items-center justify-between">
            <button
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 disabled:opacity-50"
              onClick={prev}
              disabled={step === 0 || busy}
              type="button"
            >
              Atrás
            </button>

            {step < steps.length - 1 ? (
              <button
                className="px-4 py-2 rounded-xl bg-white text-black font-medium disabled:opacity-50"
                onClick={next}
                disabled={!canGoNext() || busy}
                type="button"
              >
                Continuar
              </button>
            ) : (
              <button
                className="px-4 py-2 rounded-xl bg-white text-black font-medium disabled:opacity-50"
                onClick={submit}
                disabled={!canGoNext() || busy}
                type="button"
              >
                {busy ? "Enviando..." : "Crear cuenta"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}