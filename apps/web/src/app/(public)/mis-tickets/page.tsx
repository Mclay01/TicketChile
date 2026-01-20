// apps/web/src/app/(public)/mis-tickets/page.tsx
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import MisTicketsClient from "./ui";

export default async function MisTicketsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() ?? null;

  if (!email) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/mis-tickets")}`);
  }

  return <MisTicketsClient email={email} />;
}
