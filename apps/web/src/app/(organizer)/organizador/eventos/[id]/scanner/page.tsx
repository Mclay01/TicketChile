import { notFound } from "next/navigation";
import { EVENTS } from "@/lib/events";
import ScannerClient from "./ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ScannerPage({ params }: Props) {
  const { id } = await params;

  const event = EVENTS.find((e) => e.id === id);
  if (!event) return notFound();

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
