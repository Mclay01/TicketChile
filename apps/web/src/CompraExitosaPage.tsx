// apps/web/src/CompraExitosaPage.tsx
import { useEffect, useState } from 'react';
import { API_BASE_URL } from './api';

type TicketSummary = {
  code: string;
  status: string;
};

type PublicOrderSummary = {
  id: string;
  event: {
    title: string;
    startDateTime: string;
    venueName: string;
    venueAddress: string;
  };
  tickets: TicketSummary[];
};

type LoadState = 'idle' | 'loading' | 'success' | 'not_found' | 'error';

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function CompraExitosaPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [order, setOrder] = useState<PublicOrderSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Leer token desde la URL (?token=...)
  const [token] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('token') ?? '';
  });

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('No se encontró el identificador de la compra.');
      return;
    }

    let cancelled = false;
    let retryTimeout: number | undefined;
    let attempts = 0;
    const maxAttempts = 6; // ~18s si usamos 3s entre intentos

    async function fetchOrder() {
      if (cancelled) return;
      attempts += 1;

      try {
        setState('loading');

        const res = await fetch(
          `${API_BASE_URL}/orders/public/by-flow-token?token=${encodeURIComponent(
            token,
          )}`,
        );

        if (cancelled) return;

        if (res.status === 404) {
          // Aún no se crea la orden en el backend (webhook en curso)
          if (attempts < maxAttempts) {
            retryTimeout = window.setTimeout(fetchOrder, 3000);
            return;
          }

          setState('not_found');
          setErrorMessage(
            'Estamos terminando de procesar tu compra. Si no ves tus tickets en unos minutos, recarga la página o revisa tu correo.',
          );
          return;
        }

        if (!res.ok) {
          throw new Error(`Error HTTP ${res.status}`);
        }

        const data = (await res.json()) as PublicOrderSummary;
        setOrder(data);
        setState('success');
        setErrorMessage(null);
      } catch (err) {
        console.error('Error cargando orden pública:', err);
        if (!cancelled) {
          setState('error');
          setErrorMessage(
            'Ocurrió un problema al cargar tu compra. Intenta recargar la página.',
          );
        }
      }
    }

    void fetchOrder();

    return () => {
      cancelled = true;
      if (retryTimeout !== undefined) {
        window.clearTimeout(retryTimeout);
      }
    };
  }, [token]);

  const handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const qrSize = 160;

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
          width: '100%',
          maxWidth: '640px',
          background: '#020617',
          borderRadius: '16px',
          border: '1px solid #1f2937',
          padding: '20px 18px',
          boxShadow: '0 20px 45px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header éxito */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '999px',
              background: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 3px rgba(22,163,74,0.35)',
              fontSize: 20,
            }}
          >
            ✓
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              Compra exitosa
            </h1>
            <p
              style={{
                margin: 0,
                marginTop: 2,
                fontSize: 13,
                opacity: 0.8,
              }}
            >
              ¡Gracias por tu compra! Aquí tienes el resumen de tus tickets.
            </p>
          </div>
        </div>

        {/* Estados de carga / error */}
        {state === 'loading' && (
          <p
            style={{
              fontSize: 14,
              opacity: 0.85,
            }}
          >
            Estamos confirmando tu pago con Flow y generando tus tickets...
          </p>
        )}

        {(state === 'error' || state === 'not_found') && (
          <div
            style={{
              fontSize: 14,
              borderRadius: 10,
              padding: '10px 12px',
              border: '1px solid #b91c1c',
              background: '#451a1a',
              marginBottom: 12,
            }}
          >
            {errorMessage ??
              'No pudimos recuperar la información de tu compra.'}
          </div>
        )}

        {/* Contenido principal cuando tenemos la orden */}
        {state === 'success' && order && (
          <>
            {/* Resumen del evento */}
            <section
              style={{
                borderRadius: 12,
                border: '1px solid #1f2937',
                padding: '12px 14px',
                background:
                  'radial-gradient(circle at top left, #0f172a 0, #020617 55%)',
                marginBottom: 14,
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  margin: 0,
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                {order.event.title}
              </h2>

              <div
                style={{
                  fontSize: 13,
                  opacity: 0.9,
                }}
              >
                <div>
                  <strong>Fecha:</strong>{' '}
                  {formatDateTime(order.event.startDateTime)}
                </div>
                <div>
                  <strong>Lugar:</strong> {order.event.venueName} ·{' '}
                  {order.event.venueAddress}
                </div>
                <div>
                  <strong>Número de tickets:</strong> {order.tickets.length}
                </div>
              </div>
            </section>

            {/* Tickets */}
            <section>
              <h3
                style={{
                  fontSize: 14,
                  marginTop: 0,
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                Tus tickets
              </h3>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {order.tickets.map((t) => {
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(
                    t.code,
                  )}`;

                  const statusLabel =
                    t.status === 'USED'
                      ? 'Usado'
                      : t.status === 'CANCELLED'
                      ? 'Cancelado'
                      : 'Válido';

                  const statusColor =
                    t.status === 'USED'
                      ? '#eab308'
                      : t.status === 'CANCELLED'
                      ? '#f87171'
                      : '#22c55e';

                  return (
                    <article
                      key={t.code}
                      style={{
                        borderRadius: 10,
                        border: '1px solid #1f2937',
                        padding: '10px 12px',
                        background: '#020617',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'stretch',
                      }}
                    >
                      <div style={{ flex: 1, fontSize: 13 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            Ticket #{t.code.slice(0, 6).toUpperCase()}
                          </span>
                          <span
                            style={{
                              fontWeight: 600,
                              color: statusColor,
                            }}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          <div>
                            <strong>Código completo:</strong> {t.code}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              marginTop: 4,
                              opacity: 0.8,
                            }}
                          >
                            Muestra este código o el QR en la entrada del
                            evento.
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          width: qrSize,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <img
                          src={qrUrl}
                          alt={`QR ticket ${t.code}`}
                          style={{
                            width: '100%',
                            height: 'auto',
                            borderRadius: 8,
                            background: '#020617',
                            padding: 4,
                            border: '1px dashed #1f2937',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            opacity: 0.7,
                          }}
                        >
                          Escanea en el acceso
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* Acciones */}
            <section
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #4b5563',
                  background: 'transparent',
                  color: '#e5e7eb',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Imprimir / guardar como PDF
              </button>
              <button
                type="button"
                onClick={handleGoHome}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#22c55e',
                  color: '#020617',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Volver al inicio
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default CompraExitosaPage;
