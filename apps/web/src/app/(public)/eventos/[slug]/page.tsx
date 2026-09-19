import { notFound } from "next/navigation";
import { getEventBySlugDb } from "@/lib/events.server";
import EventDetail from "@/components/tc/EventDetail";
export const dynamic="force-dynamic";
export default async function EventPage({params}:{params:Promise<{slug:string}>}){const event=await getEventBySlugDb((await params).slug);if(!event)notFound();return <EventDetail event={event}/>;}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const event=await getEventBySlugDb((await params).slug);return event?{title:event.seoTitle||event.title,description:event.seoDescription||event.shortDescription||event.description.slice(0,170)}:{title:'Evento no disponible'};}
