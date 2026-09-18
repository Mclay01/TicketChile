import { notFound } from "next/navigation";
import { requireEventAccess } from "@/lib/event-access.server";
import { AccessError } from "@/lib/access.server";
import ScannerClient from "./ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ScannerPage({ params }: Props) {
  const { id } = await params;

  const access = await requireEventAccess(id).catch(error => {
    if (error instanceof AccessError) return notFound();
    throw error;
  });
  const { event } = access;

  return (
    <ScannerClient
      eventId={event.id}
      eventTitle={event.title}
      eventSlug={event.slug}
      eventCity={event.city}
      eventVenue={event.venue}
    />
  );
}
