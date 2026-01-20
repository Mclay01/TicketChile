import Link from "next/link";

type Props = { searchParams: Promise<{ from?: string }> };

export default async function OrganizadorLoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from =
    typeof sp.from === "string" && sp.from.startsWith("/organizador") ? sp.from : "/organizador";

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-md px-6 py-16 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Acceso organizador</h1>
          <p className="text-sm text-white/60">
            Esto es demo, pero igual no vamos a dejar el backstage abierto.
          </p>
        </div>

        <form
          action="/api/organizador/login"
          method="POST"
          className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
        >
          <input type="hidden" name="from" value={from} />

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
      </div>
    </div>
  );
}
