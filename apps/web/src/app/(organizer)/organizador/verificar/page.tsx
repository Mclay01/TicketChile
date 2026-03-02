// apps/web/src/app/(organizer)/organizador/verificar/page.tsx
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
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6">
        <div className="h-6 w-44 bg-white/10 rounded mb-2" />
        <div className="h-4 w-56 bg-white/10 rounded mb-6" />
        <div className="space-y-3">
          <div className="h-10 bg-white/10 rounded-xl" />
          <div className="h-10 bg-white/10 rounded-xl" />
        </div>
      </div>
    </main>
  );
}