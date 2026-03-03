import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { getOrganizerDashboardStatsPgServer } from "@/lib/organizer.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_ORG_SESS = "tc_org_sess";

async function requireOrganizerApproved() {
  const ck = await cookies();
  const sid = ck.get(COOKIE_ORG_SESS)?.value || "";

  if (!sid || sid.trim().length < 10) {
    return { ok: false as const, status: 401, reason: "missing_session" };
  }

  const r = await pool.query<{
    organizer_id: string;
    verified: boolean;
    approved: boolean;
  }>(
    `
    SELECT os.organizer_id, ou.verified, ou.approved
    FROM organizer_sessions os
    JOIN organizer_users ou ON ou.id = os.organizer_id
    WHERE os.id = $1
      AND os.expires_at > NOW()
    LIMIT 1
    `,
    [sid]
  );

  const row = r.rows?.[0];
  if (!row) return { ok: false as const, status: 401, reason: "invalid_session" };
  if (!row.verified) return { ok: false as const, status: 403, reason: "unverified" };
  if (!row.approved) return { ok: false as const, status: 403, reason: "pending" };

  return { ok: true as const, organizerId: row.organizer_id };
}

export async function GET() {
  const gate = await requireOrganizerApproved();
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: "No autorizado.", reason: gate.reason },
      { status: gate.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const statsByEvent = await getOrganizerDashboardStatsPgServer();

  return NextResponse.json(
    { ok: true, statsByEvent, nowISO: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}