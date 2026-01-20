"use client";

import { signIn } from "next-auth/react";

export default function SignInButtons() {
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/" })}
      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
    >
      Continuar con Google
    </button>
  );
}
