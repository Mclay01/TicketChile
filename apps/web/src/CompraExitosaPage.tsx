// apps/web/src/CompraExitosaPage.tsx
import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from './api';

type PublicOrderTicket = {
  code: string;
  status: string;
  attendeeName?: string;
  attendeeEmail?: string;
};

type PublicOrderResponse = {
  orderId: string;
  eventTitle: string;
  eventDate: string | null;
  eventVenue: string | null;
  tickets: PublicOrderTicket[];
};

type LoadStatus = 'loading' | 'waiting' | 'found' | 'error' | 'missing-token';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('es-CL', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

export default function CompraExitosaPage() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrderResponse | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const rawToken = url.searchParams.get('token');

    if (!rawToken) {
      setStatus('missing-token');
      setError('No se encontró el identificador del pago en la URL.');
      return;
    }

    // 👇 A partir de aquí token es string, no null
    const token: string = rawToken;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30; // ~2 minutos a 4s
    const delayMs = 4000;

    async function poll() {
      if (cancelled) return;
      attempts += 1;

      try {
        const resp = await fetch(
          `${API_BASE_URL}/orders/public/by-flow-token?token=${encodeURIComponent(
            token,
          )}`,
        );

        if (resp.status === 404) {
          if (attempts === 1) setStatus('waiting');

          if (attempts < maxAttempts) {
            setTimeout(poll, delayMs);
          } else {
            setStatus('error');
            setError(
              'No pudimos encontrar la compra. Si el cargo aparece en Flow, escríbenos con el correo usado en la compra.',
            );
          }
          return;
        }

        if (!resp.ok) {
          throw new Error(`Error ${resp.status}`);
        }

        const data = (await resp.json()) as PublicOrderResponse;

        if (!data.tickets || !data.tickets.length) {
          if (attempts < maxAttempts) {
            setStatus('waiting');
            setTimeout(poll, delayMs);
            return;
          }
          setStatus('error');
          setError(
            'No se encontraron tickets asociados a este pago. Si el problema persiste, contáctanos.',
          );
          return;
        }

        setOrder(data);
        setStatus('found');
      } catch (e: any) {
        console.error('Error cargando orden por Flow token', e);
        setStatus('error');
        setError(
          e?.message ?? 'Hubo un problema al cargar el resumen de tu compra.',
        );
      }
    }

    setStatus('loading');
    setError(null);
    poll();

    return () => {
      cancelled = true;
    };
  }, []);

  const mainMessage = (() => {
    if (status === 'missing-token') {
      return error ?? 'No se encontró el identificador de la compra.';
    }
    if (status === 'error') {
      return (
        error ??
        'Hubo un problema al cargar el resumen de tu compra. Revisa tu correo o contáctanos.'
      );
    }
    if (status === 'waiting') {
      return (
        'Todavía no encontramos tu compra. Si el pago se acaba de completar, ' +
        'espera unos segundos y esta página se actualizará sola.'
      );
    }
    if (status === 'loading') {
      return 'Estamos confirmando tu pago con Flow y buscando tus tickets...';
    }
    if (status === 'found') {
      return 'Compra confirmada. Aquí tienes el resumen de tu compra y tus tickets.';
    }
    return '';
  })();

  const isSuccess = status === 'found';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 360px) minmax(0, 640px)',
          gap: 24,
          width: '100%',
          maxWidth: 1100,
        }}
      >
        {/* Columna izquierda */}
        <div
          style={{
            background: '#020617',
            borderRadius: 16,
            border: '1px solid #1f2937',
            padding: 24,
            boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '999px',
                background: isSuccess ? '#16a34a' : '#0f172a',
                border: isSuccess ? 'none' : '1px solid #374151',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              {isSuccess ? '✓' : 'i'}
            </div>
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                Compra exitosa
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>
                Gracias por tu compra. Aquí tienes el resumen de tus tickets.
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 12,
              border: '1px solid',
              borderColor:
                status === 'error' || status === 'missing-token'
                  ? '#f87171'
                  : status === 'found'
                  ? '#16a34a'
                  : '#f97316',
              background:
                status === 'error' || status === 'missing-token'
                  ? '#450a0a'
                  : status === 'found'
                  ? '#022c22'
                  : '#451a03',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {mainMessage}
          </div>

          {order && (
            <div
              style={{
                marginTop: 18,
                fontSize: 13,
                color: '#9ca3af',
                borderTop: '1px solid #1f2937',
                paddingTop: 12,
              }}
            >
              <div>
                <strong>Orden:</strong> {order.orderId}
              </div>
              <div>
                <strong>Evento:</strong> {order.eventTitle}
              </div>
              {order.eventDate && (
                <div>
                  <strong>Fecha:</strong> {formatDate(order.eventDate)}
                </div>
              )}
              {order.eventVenue && (
                <div>
                  <strong>Lugar:</strong> {order.eventVenue}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Columna derecha: tickets */}
        <div
          style={{
            background: '#020617',
            borderRadius: 16,
            border: '1px solid #1f2937',
            padding: 24,
            boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Tus tickets
          </h2>

          {status === 'loading' || status === 'waiting' ? (
            <p style={{ fontSize: 14, color: '#9ca3af' }}>
              Estamos terminando de confirmar tu compra...
            </p>
          ) : null}

          {status === 'error' || status === 'missing-token' ? (
            <p style={{ fontSize: 14, color: '#fca5a5' }}>
              {error ??
                'No pudimos cargar los tickets. Revisa tu correo o contáctanos.'}
            </p>
          ) : null}

          {status === 'found' && order && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              {order.tickets.map((t, idx) => {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  t.code,
                )}`;

                return (
                  <div
                    key={`${t.code}-${idx}`}
                    style={{
                      borderRadius: 12,
                      border: '1px solid #1f2937',
                      padding: 16,
                      background:
                        'radial-gradient(circle at top left, rgba(56,189,248,0.12), transparent 55%), #020617',
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 8,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      Ticket{' '}
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid #374151',
                          marginLeft: 6,
                        }}
                      >
                        {t.status}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: '#9ca3af',
                        marginBottom: 10,
                      }}
                    >
                      {t.attendeeName && (
                        <div>
                          <strong>Nombre:</strong> {t.attendeeName}
                        </div>
                      )}
                      {t.attendeeEmail && (
                        <div>
                          <strong>Email:</strong> {t.attendeeEmail}
                        </div>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <strong>Código:</strong>{' '}
                        <code
                          style={{
                            background: '#020617',
                            padding: '2px 6px',
                            borderRadius: 6,
                            border: '1px solid #374151',
                            fontSize: 12,
                          }}
                        >
                          {t.code}
                        </code>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <img
                        src={qrUrl}
                        alt={`QR ticket ${t.code}`}
                        width={120}
                        height={120}
                        style={{
                          borderRadius: 8,
                          border: '1px solid #111827',
                          background: '#0b1120',
                        }}
                      />
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        Presenta este QR en la entrada. También te enviamos una
                        copia al correo usado en la compra.
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
