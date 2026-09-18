import { notFound } from "next/navigation";
import { discoveryFacets } from "@/lib/events.server";
import type { SearchValues } from "@/lib/discovery";
import Catalog from "@/components/tc/Catalog";
export const dynamic = "force-dynamic";
export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchValues> }) {
  const { slug } = await params;
  if (!(await discoveryFacets()).categories.some(c => c.slug === slug)) notFound();
  return <Catalog input={await searchParams} category={slug} />;
}
