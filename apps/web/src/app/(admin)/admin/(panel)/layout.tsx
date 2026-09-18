import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-guard.server";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return children;
}
