import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

type Props = { searchParams: Promise<{ from?: string }> };

function parseAllowlist(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedOrganizerEmail(email?: string | null) {
  if (!email) return false;

  // ✅ FAIL-CLOSED: si no configuras allowlist, NADIE es organizador
  const raw = String(process.env.ORGANIZER_EMAILS || "").trim();
  if (!raw) return false;

  const allow = parseAllowlist(raw);
  return allow.includes(String(email).toLowerCase());
}

export default async function OrganizadorLoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from =
    typeof sp.from === "string" && sp.from.startsWith("/organizador")
      ? sp.from
      : "/organizador";

  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  const hasSession = Boolean(email);
  const allowed = isAllowedOrganizerEmail(email);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-md px-6 py-16 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Acceso organizador</h1>
          <p className="text-sm text-white/60">
            Backstage interno. Si no eres tú, ni aunque adivines la clave.
          </p>
        </div>

        {!hasSession ? (
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-white/80">
            Primero inicia sesión con tu cuenta (NextAuth). Luego vuelves aquí.
            <div className="mt-3">
              <Link
                href="/signin"
                className="inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          </div>
        ) : !allowed ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-white/80">
            Tu cuenta <span className="font-semibold">{email}</span> no está autorizada
            como organizador.
            <div className="mt-2 text-xs text-white/60">
              Revisa la env <code className="text-white/80">ORGANIZER_EMAILS</code>.
            </div>
          </div>
        ) : (
          <form
            action="/api/organizador/login"
            method="POST"
            className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
          >
            <input type="hidden" name="from" value={from} />

            <div className="text-xs text-white/60">
              Sesión: <span className="text-white/80">{email}</span>
            </div>

            <label className="block text-sm text-white/70">
              Clave
              <input
                name="key"
                type="password"
                placeholder="ORGANIZER_KEY"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30"
                autoFocus
                required
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Entrar
            </button>

            <div className="text-xs text-white/50">
              <Link href="/eventos" className="hover:text-white">
                ← volver a eventos
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}