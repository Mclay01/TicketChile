import { audit,type Actor } from "@/lib/security/audit.server";
// apps/web/src/lib/events.admin.server.ts
import "server-only";
import { pool,withTx } from "@/lib/db";

export type AdminEventRow = {
  id: string;
  slug: string;
  title: string;
  city: string;
  venue: string;
  date_iso: string;
  description: string;
  is_published: boolean;
  created_at?: string;
};

export async function adminListEventsDb(opts?: { published?: boolean }) {
  const client = await pool.connect();
  try {
    const where =
      typeof opts?.published === "boolean"
        ? `WHERE is_published = ${opts.published ? "true" : "false"}`
        : "";

    const r = await client.query<AdminEventRow>(
      `
      SELECT id, slug, title, city, venue, date_iso, description, is_published, created_at
      FROM events
      ${where}
      ORDER BY date_iso DESC
      `
    );

    return r.rows ?? [];
  } finally {
    client.release();
  }
}

export async function adminGetEventDb(id: string) {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `
      SELECT id, slug, title, city, venue, date_iso, description,
             image, hero_desktop, hero_mobile,
             is_published, created_at
      FROM events
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    return r.rows?.[0] ?? null;
  } finally {
    client.release();
  }
}

export async function adminSetPublishedDb(id: string, published: boolean, actor:Actor) {
  await withTx(async client=>{
    const result=await client.query("UPDATE events SET is_published=$2 WHERE id=$1 RETURNING id",[id,published]);
    if(result.rowCount)await audit(client,{actor,eventId:id,action:published?"event.published":"event.unpublished",targetType:"event",targetId:id});
  });
}
