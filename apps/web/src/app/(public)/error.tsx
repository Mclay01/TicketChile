"use client";
import { EmptyState } from "@/components/tc/ui";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="page stack"><EmptyState title="No pudimos cargar esta página">Intenta nuevamente en unos momentos.</EmptyState><button className="btn" onClick={reset}>Reintentar</button></div>; }
