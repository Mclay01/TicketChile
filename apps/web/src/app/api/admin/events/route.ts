// apps/web/src/app/api/admin/events/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { adminListEventsDb } from "@/lib/events.admin.server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmissionRow = {
  id: string;
  organizer_id: string;
  status: string;
  payload: any;
  created_at: Date;
  organizer_display_name: string | null;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab"); // pending | published

  // ✅ Pending = submissions en revisión
  if (tab === "pending") {
    const r = await pool.query<SubmissionRow>(
      `
      SELECT
        s.id,
        s.organizer_id,
        s.status,
        s.payload,
        s.created_at,
        ou.display_name AS organizer_display_name
      FROM organizer_event_submissions s
      LEFT JOIN organizer_users ou ON ou.id = s.organizer_id
      WHERE UPPER(s.status) = 'IN_REVIEW'
      ORDER BY s.created_at DESC
      `
    );

    const events = r.rows.map((row) => {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      return {
        id: String(row.id),
        slug: "",
        title: String(payload.title || "Evento sin título"),
        city: String(payload.city || ""),
        venue: String(payload.venue || ""),
        date_iso: String(payload.dateISO || ""),
        is_published: false,
        kind: "submission" as const,
        organizer_display_name: row.organizer_display_name || null,
        submission_status: String(row.status || "").toUpperCase(),
      };
    });

    return NextResponse.json({ ok: true, events });
  }

  // ✅ Published = eventos reales publicados
  const events = await adminListEventsDb({ published: true });
  const normalized = (events || []).map((e: any) => ({
    ...e,
    kind: "event" as const,
  }));

  return NextResponse.json({ ok: true, events: normalized });
}