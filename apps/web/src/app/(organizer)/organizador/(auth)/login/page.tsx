// apps/web/src/app/(organizer)/organizador/(auth)/login/page.tsx
import { Suspense } from "react";
import OrganizerLoginClient from "./OrganizerLoginClient";

export default function OrganizadorLoginPage() {
  return (
    <Suspense fallback={null}>
      <OrganizerLoginClient />
    </Suspense>
  );
}