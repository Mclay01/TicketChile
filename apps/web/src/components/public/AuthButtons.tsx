"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export default function AuthButtons({ email }: { email: string | null }) {
  if (!email) {
    return (
      <>
        <Link
          href="/signin"
          className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/signup"
          className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Registrarse
        </Link>
      </>
    );
  }

  return (
    <>
      <span className="rounded-lg px-3 py-2 text-sm text-white/70">
        {email}
      </span>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Salir
      </button>
    </>
  );
}
