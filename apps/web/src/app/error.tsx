'use client';
import Recovery from '@/components/tc/Recovery';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="tc container"><Recovery reset={reset} /></main>; }
