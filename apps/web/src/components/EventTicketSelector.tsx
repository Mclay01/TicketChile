"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/events";
import { buildCartString, formatCLP } from "@/lib/events";
import { QuantityStepper } from "@/components/tc/interactive";
import { Button, Notice } from "@/components/tc/ui";
export default function EventTicketSelector({ event }: { event: Event }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [stock, setStock] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/remaining?eventId=${encodeURIComponent(event.id)}`, { cache: "no-store", signal: ac.signal })
      .then(async r => { if (!r.ok) throw new Error(); const d = await r.json(); if (!d.remainingByTicketTypeId) throw new Error(); setStock(d.remainingByTicketTypeId); setError(false); })
      .catch(() => { if (!ac.signal.aborted) setError(true); });
    return () => ac.abort();
  }, [event.id, retry]);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  return <section className="panel stack"><div><p className="eyebrow">Tu próxima experiencia</p><h2>Elige tus entradas</h2></div>
    {error ? <Notice error>No pudimos consultar disponibilidad. <button className="btn secondary" onClick={() => setRetry(v => v + 1)}>Reintentar</button></Notice> : !stock && <p role="status" className="hint">Consultando disponibilidad…</p>}
    <div>{event.ticketTypes.map(tt => { const max = Math.max(0, Math.min(stock?.[tt.id] ?? 0, tt.maxPerOrder ?? 10, 10 - count + (qty[tt.id] || 0))); return <div className="tier" key={tt.id}><div className="stack-sm"><h3>{tt.name}</h3><p className="mono">${formatCLP(tt.priceCLP)} <small>CLP</small></p><p className="hint">{stock ? stock[tt.id] > 0 ? `${stock[tt.id]} disponibles` : "Agotado" : "Consultando…"}</p></div><QuantityStepper label={tt.name} value={qty[tt.id] || 0} max={max} disabled={!stock || error} onChange={value => setQty(q => ({ ...q, [tt.id]: value }))} /></div>; })}</div>
    {!event.ticketTypes.length && <Notice>No hay tipos de entrada disponibles.</Notice>}
    <p className="hint">Hasta 10 entradas por compra. El precio y la disponibilidad se confirman al continuar con el pago.</p>
    <Button disabled={!count || !stock || error} onClick={() => { const cart = buildCartString(qty); try { sessionStorage.setItem(`tc_cart_${event.id}`, JSON.stringify({ cartParam: cart })); } catch {} router.push(`/checkout/${encodeURIComponent(event.id)}?cart=${encodeURIComponent(cart)}`); }}>Continuar{count ? ` · ${count} ${count === 1 ? "entrada" : "entradas"}` : ""} →</Button>
  </section>;
}
