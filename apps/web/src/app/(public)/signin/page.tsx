import { Suspense } from "react";
import SignInClient from "./ui";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <Suspense fallback={<p role="status">Cargando acceso…</p>}>
      <SignInClient googleAvailable={Boolean((process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) && (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET))} />
    </Suspense>
  );
}
