import { getOrganizerDashboardStatsDemoServer } from "@/lib/demo-db.server";
import { getOrganizerDashboardStatsPgServer } from "@/lib/organizer.pg.server";

export async function getOrganizerDashboardStatsServer() {
  const hasPg = Boolean(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );

  return hasPg ? await getOrganizerDashboardStatsPgServer()
               : getOrganizerDashboardStatsDemoServer();
}
