// apps/web/src/MisTicketsOrganizer.tsx
import React, { useEffect, useState } from 'react';
import { fetchOrganizerTickets } from './api';
import type { MyTicket } from './api';

type Props = {
  /** Token JWT del organizador. Si no se pasa, el componente buscará en localStorage 'token' como fallback. */
  token?: string;
};

export default function MisTicketsOrganizer({ token }: Props) {
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  // obtenemos token: prop -> localStorage -> null
  const authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') ?? undefined : undefined);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      if (!authToken) {
        setErr('Necesitas iniciar sesión como organizador para ver esto.');
        setLoading(false);
        return;
      }

      try {
        const data = await fetchOrganizerTickets(authToken);
        // Si el backend devuelve tickets planos con otra forma, este componente intenta usar lo que venga.
        // Forzamos el tipo MyTicket[] lo más seguro posible.
        setTickets(Array.isArray(data) ? data as MyTicket[] : []);
      } catch (e: any) {
        console.error('fetch organizer tickets error', e);
        setErr(e?.message ?? 'Error cargando tickets');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  if (loading) return <div>Cargando tickets...</div>;
  if (err) return <div style={{ color: 'crimson' }}>Error: {err}</div>;
  if (!tickets.length) return <div>No hay tickets vendidos todavía.</div>;

  // Agrupar por orderId para mejor presentación
  const ordersMap = new Map<string, MyTicket[]>();
  for (const t of tickets) {
    const oid = (t.order && (t.order.id as string)) ?? (t.orderId ?? 'sin-orden');
    if (!ordersMap.has(oid)) ordersMap.set(oid, []);
    ordersMap.get(oid)!.push(t);
  }

  return (
    <div style={{ padding: 12 }}>
      <h2>Mis Tickets (ventas)</h2>

      {[...ordersMap.entries()].map(([orderId, ts]) => {
        const first = ts[0];
        const eventTitle = first.order?.event?.title ?? (first as any).event?.title ?? 'Evento desconocido';
        const orderCreatedAt = first.order?.createdAt ?? '';
        const totalForOrder = ts.reduce((acc, t) => {
          // No siempre tenemos price por ticket aquí; evitamos suponer. Mostrar cantidad y lista.
          return acc + 1;
        }, 0);

        return (
          <div
            key={orderId}
            style={{
              border: '1px solid #e6e6e6',
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <strong>Orden:</strong> {orderId} {' '}
              <span style={{ color: '#666' }}>•</span> <strong>Evento:</strong> {eventTitle} {' '}
              <span style={{ color: '#666' }}>•</span> <small>{orderCreatedAt ? new Date(orderCreatedAt).toLocaleString() : ''}</small>
            </div>

            <div style={{ marginTop: 6 }}>
              <strong>Tickets ({totalForOrder}):</strong>
              <ul style={{ marginTop: 8 }}>
                {ts.map((t) => (
                  <li key={t.id} style={{ marginBottom: 6 }}>
                    <div>
                      <strong>{t.attendeeName}</strong> ({t.attendeeEmail})
                    </div>
                    <div style={{ fontSize: 13, color: '#444' }}>
                      Tipo: {t.ticketType?.name ?? t.ticketTypeId} — Código: <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{t.code}</code> — Estado: {t.status}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
