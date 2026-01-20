// apps/web/src/components/Navbar.tsx
import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/auth";

async function doSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function Navbar() {
  const session = await auth();
  const email = session?.user?.email;

  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo + Home */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.svg"
            alt="Ticketchile"
            width={140}
            height={28}
            priority
          />
        </Link>

        <nav className="flex items-center gap-3">
          {/* Esto sólo aparece si hay sesión */}
          {email ? (
            <>
              <Link
                href="/mis-tickets"
                className="rounded-xl px-3 py-2 text-sm hover:bg-black/5"
              >
                Mis tickets
              </Link>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{email}</span>

                <form action={doSignOut}>
                  <button
                    type="submit"
                    className="rounded-xl border px-3 py-2 text-sm hover:bg-black/5"
                  >
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              {/* Reemplaza “Organizador” por login */}
              <Link
                href="/signin"
                className="rounded-xl border px-3 py-2 text-sm hover:bg-black/5"
              >
                Iniciar sesión
              </Link>

              <Link
                href="/signin"
                className="rounded-xl bg-black px-3 py-2 text-sm text-white hover:opacity-90"
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
