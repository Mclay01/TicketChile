"use client";

import Link from "next/link";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";

export default function SiteHeader() {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const loading = status === "loading";

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:px-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/brand/ticketchile-logo.png"
            alt="Ticketchile"
            width={180}
            height={40}
            priority
            className="h-8 w-auto"
          />
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-3">

          <Link
            href="/eventos"
            className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10"
          >
            Eventos
          </Link>

          {loading ? (
            <span className="text-sm text-white/60">…</span>
          ) : email ? (
            <>
              <Link
                href={`/mis-tickets?email=${encodeURIComponent(email)}`}
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10"
              >
                Mis tickets
              </Link>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline max-w-[240px] truncate text-sm text-white/70">
                  {email}
                </span>

                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                >
                  Salir
                </button>
              </div>
            </>
          ) : (
            <>
              <Link
                href="/signin"
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10"
              >
                Iniciar sesión
              </Link>

              <Link
                href="/signup"
                className="rounded-xl border border-white/10 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
                Registrarse
              </Link>
            </>
          )}

        </nav>
      </div>
    </header>
  );
}