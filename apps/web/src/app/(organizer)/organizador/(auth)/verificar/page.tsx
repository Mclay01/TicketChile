// apps/web/src/app/(organizer)/organizador/(auth)/verificar/page.tsx
import { Suspense } from "react";
import OrganizerVerifyClient from "./OrganizerVerifyClient";

export default function OrganizerVerifyPage() {
  return (
    <Suspense fallback={<VerifySkeleton />}>
      <OrganizerVerifyClient />
    </Suspense>
  );
}

function VerifySkeleton() {
  return (
    <main className="min-h-[72vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <div className="h-7 w-44 rounded bg-white/10" />
          <div className="mt-2 h-4 w-56 rounded bg-white/10" />
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          <div className="space-y-3">
            <div className="h-10 rounded-lg bg-black/10" />
            <div className="h-10 rounded-lg bg-black/10" />
          </div>
        </div>
      </div>
    </main>
  );
}