import Catalog from "@/components/tc/Catalog";
import type { SearchValues } from "@/lib/discovery";
export const dynamic = "force-dynamic";
export default async function EventsPage({ searchParams }: { searchParams: Promise<SearchValues> }) { return <Catalog input={await searchParams} />; }
