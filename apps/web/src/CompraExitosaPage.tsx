// apps/web/src/CompraExitosaPage.tsx
import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from './api';

type PublicOrderResponse = {
  id: string;
  event: {
    title: string;
    description?: string; // opcional, por si el backend la envía
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
          )}`
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

  // --- helpers de UI (no tocan la lógica de datos) ---

  const handleDownloadPdf = () => {
    if (typeof window !== 'undefined') {
      // El usuario luego elige "Guardar como PDF" en el diálogo de impresión
      window.print();
    }
  };

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
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>{order.event.title}</h3>
            <p style={{ margin: 0, color: '#444' }}>
              {new Date(order.event.startDateTime).toLocaleString()} ·{' '}
              {order.event.venueName} – {order.event.venueAddress}
            </p>
            {order.event.description && (
              <p
                style={{
                  marginTop: 8,
                  color: '#555',
                  lineHeight: 1.5,
                  fontSize: 14,
                }}
              >
                {order.event.description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              background:
                'linear-gradient(135deg, #111827 0%, #1f2937 50%, #4b5563 100%)',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              marginBottom: 20,
            }}
          >
            {/* iconito simple con CSS, así no dependemos de librerías */}
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: '2px solid currentColor',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
              }}
            >
              ↓
            </span>
            Descargar comprobante (PDF)
          </button>

          <ul style={{ marginTop: 8, padding: 0 }}>
            {order.tickets.map((t) => (
              <li
                key={t.code}
                style={{
                  marginBottom: 24,
                  listStyle: 'none',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  background: '#fafafa',
                }}
              >
                <div style={{ flex: '1 1 auto' }}>
                  <div style={{ marginBottom: 6, fontSize: 14 }}>
                    <span style={{ fontWeight: 600 }}>Código</span>{' '}
                    <code
                      style={{
                        background: '#111',
                        padding: '4px 8px',
                        borderRadius: 4,
                        color: '#f9fafb',
                        fontSize: 13,
                      }}
                    >
                      {t.code}
                    </code>{' '}
                    <span style={{ color: '#6b7280' }}>—</span>{' '}
                    <span>
                      Estado:{' '}
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            t.status === 'VALID'
                              ? '#16a34a'
                              : t.status === 'USED'
                              ? '#ea580c'
                              : '#b91c1c',
                        }}
                      >
                        {t.status}
                      </span>
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: '#6b7280',
                      maxWidth: 360,
                    }}
                  >
                    Presenta este código o el QR en la entrada del evento.
                  </p>
                </div>

                {/* QR visible para que el cliente pueda usar la entrada */}
                <div style={{ flex: '0 0 auto' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      t.code
                    )}`}
                    width={140}
                    height={140}
                    alt={`QR ticket ${t.code}`}
                    style={{
                      background: '#fff',
                      padding: 4,
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                    }}
                  />
                </div>
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
    <div
      className="layout-compra-exitosa"
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '32px 16px',
        background: '#f3f4f6',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 980,
          background: '#ffffff',
          borderRadius: 24,
          boxShadow: '0 18px 45px rgba(15,23,42,0.2)',
          padding: '28px 24px 32px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
          gap: 32,
        }}
      >
        {/* Columna izquierda */}
        <section
          className="card-left"
          style={{
            paddingRight: 24,
            borderRight: '1px solid #e5e7eb',
          }}
        >
          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            Compra exitosa
          </h1>
          <p
            style={{
              marginTop: 0,
              marginBottom: 16,
              color: '#4b5563',
              fontSize: 15,
            }}
          >
            {renderLeftMessage()}
          </p>

          {status === 'done' && order && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                borderRadius: 16,
                background:
                  'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(129,140,248,0.08))',
                border: '1px solid rgba(59,130,246,0.25)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: '#1f2937',
                }}
              >
                Guarda este comprobante o descárgalo en PDF. También te enviamos
                los detalles al correo usado en la compra.
              </p>
            </div>
          )}
        </section>

        {/* Columna derecha */}
        <section
          className="card-right"
          style={{
            paddingLeft: 8,
          }}
        >
          <h2
            style={{
              fontSize: 20,
              marginTop: 4,
              marginBottom: 12,
            }}
          >
            Tus tickets
          </h2>
          {renderTickets()}
        </section>
      </div>
    </div>
  );
}
