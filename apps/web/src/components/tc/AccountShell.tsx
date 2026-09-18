import { redirect } from "next/navigation";
import { getBuyerEmail } from "@/lib/buyer-guard.server";
import AccountNav from "./AccountNav";
export default async function AccountShell({ children }: { children: React.ReactNode }) {
  if (!await getBuyerEmail()) redirect("/signin?callbackUrl=/cuenta");
  return <div className="page account-layout"><AccountNav /><div style={{ minWidth: 0 }}>{children}</div></div>;
}
