// apps/web/src/lib/organizer-guard.server.ts
import "server-only";
import { cookies } from "next/headers";
import { getOrganizerFromSession } from "@/lib/organizer-auth.pg.server";

export type OrganizerGate =
  | { ok: true; organizerId: string }
  | { ok: false; status: 401 | 403; reason: "missing" | "invalid" | "unverified" | "pending" };

export async function requireOrganizerApproved(): Promise<OrganizerGate> {
  const ck = await cookies();
  const sid = ck.get("tc_org_sess")?.value || "";

  if (!sid || sid.trim().length < 10) {
    return { ok: false, status: 401, reason: "missing" };
  }

  const org = await getOrganizerFromSession(sid);
  if (!org) return { ok: false, status: 401, reason: "invalid" };
  if (!org.verified) return { ok: false, status: 403, reason: "unverified" };
  if (!org.approved) return { ok: false, status: 403, reason: "pending" };

  return { ok: true, organizerId: org.id };
}