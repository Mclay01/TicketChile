// apps/web/src/CompraExitosaPage.tsx
import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from './api';

type PublicOrderResponse = {
  id: string;
  event: {
    title: string;
    startDateTime: string;
    venueName: string;
    venueAddress: string;
  };
  tickets: {
    code: string;
    status: string;
  }[];
};

const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 3000;

export default function CompraExitosaPage() {
  const [order, setOrder] = useState<PublicOrderResponse | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'waiting' | 'not-found' | 'error' | 'done'
  >('loading');

  // leer token de la URL
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = new URLSearchParams(search);
  const token = params.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timeoutId: number | undefined;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;

      try {
        const res = await fetch(
          `${API_BASE_URL}/orders/public/by-flow-token?token=${encodeURIComponent(
            token
          )}`,
          { credentials: 'include' }
        );

        if (res.ok) {
          const data = (await res.json()) as PublicOrderResponse;
          if (!cancelled) {
            setOrder(data);
            setStatus('done');
          }
          return;
        }

        if (res.status === 404) {
          // Orden aún no existe en la API
          if (attempts >= MAX_ATTEMPTS) {
            if (!cancelled) setStatus('not-found');
            return;
          }
          if (!cancelled) {
            setStatus('waiting');
            timeoutId = window.setTimeout(poll, RETRY_DELAY_MS);
          }
          return;
        }

        // Otro error HTTP
        console.error('Error HTTP en compra-exitosa:', res.status);
        if (!cancelled) setStatus('error');
      } catch (e) {
        console.error('Error network en compra-exitosa:', e);
        if (attempts >= MAX_ATTEMPTS) {
          if (!cancelled) setStatus('error');
          return;
        }
        if (!cancelled) {
          setStatus('waiting');
          timeoutId = window.setTimeout(poll, RETRY_DELAY_MS);
        }
      }
    };

    setStatus('waiting');
    poll();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [token]);

  // --- Render (usa tus estilos actuales) ---

  const renderLeftMessage = () => {
    if (!token || status === 'error') {
      return 'No pudimos procesar la compra. Si el cargo aparece en Flow, escríbenos con el correo usado.';
    }
    if (status === 'waiting' || status === 'loading') {
      return 'Todavía no encontramos tu compra. Si el pago se acaba de completar, espera unos segundos; esta página se actualizará sola.';
    }
    if (status === 'not-found') {
      return 'No pudimos encontrar la compra. Si el cargo aparece en Flow, escríbenos con el correo usado en la compra.';
    }
    // done
    return 'Gracias por tu compra. Aquí tienes el resumen de tus tickets.';
  };

  const renderTickets = () => {
    if (status === 'done' && order) {
      return (
        <div>
          <h3>{order.event.title}</h3>
          <p>
            {new Date(order.event.startDateTime).toLocaleString()} ·{' '}
            {order.event.venueName} – {order.event.venueAddress}
          </p>
          <ul style={{ marginTop: 16 }}>
            {order.tickets.map((t) => (
              <li key={t.code} style={{ marginBottom: 8 }}>
                <div>
                  Código:{' '}
                  <code
                    style={{
                      background: '#111',
                      padding: '4px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {t.code}
                  </code>{' '}
                  — Estado: {t.status}
                </div>
                {/* Aquí podrías añadir el QR si quieres */}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (status === 'waiting' || status === 'loading') {
      return <p>Estamos terminando de confirmar tu compra...</p>;
    }

    if (status === 'not-found') {
      return (
        <p>
          No pudimos encontrar la compra. Si el cargo aparece en Flow,
          escríbenos con el correo usado en la compra.
        </p>
      );
    }

    return (
      <p>
        Ocurrió un error al cargar el resumen de la compra. Si el cargo aparece
        en Flow, contáctanos con el correo usado en la compra.
      </p>
    );
  };

  return (
    <div className="layout-compra-exitosa">
      {/* Columna izquierda */}
      <section className="card-left">
        <h1>Compra exitosa</h1>
        <p>{renderLeftMessage()}</p>
      </section>

      {/* Columna derecha */}
      <section className="card-right">
        <h2>Tus tickets</h2>
        {renderTickets()}
      </section>
    </div>
  );
}
