import { useEffect, useState } from 'react';

// misma base que en App.tsx
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

type TicketStatus = 'VALID' | 'USED' | 'CANCELLED';

interface PublicOrderResponse {
  id: string;
  event: {
    title: string;
    startDateTime: string;
    venueName: string;
    venueAddress: string;
  };
  tickets: {
    code: string;
    status: TicketStatus;
  }[];
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('es-CL', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

function statusLabel(status: TicketStatus) {
  switch (status) {
    case 'VALID':
      return 'Válido';
    case 'USED':
      return 'Usado';
    case 'CANCELLED':
      return 'Cancelado';
    default:
      return status;
  }
}

export default function CompraExitosaPage() {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<PublicOrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function load() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams(window.location.search);
      const tokenFromUrl = params.get('token');

      let tokenFromStorage: string | null = null;
      const raw = window.localStorage.getItem('tiketera_pending_payment');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.flowToken === 'string') {
            tokenFromStorage = parsed.flowToken;
          }
        } catch {
          // da lo mismo
        }
      }

      const finalToken = tokenFromUrl ?? tokenFromStorage;

      if (!finalToken) {
        setError('No se encontró el identificador de la compra.');
        setLoading(false);
        return;
      }

      try {
        const url = new URL(
          `${API_BASE_URL}/orders/public/by-flow-token`,
        );
        url.searchParams.set('token', finalToken);

        const res = await fetch(url.toString(), {
          method: 'GET',
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError(
              'No encontramos una compra asociada a este enlace. ' +
                'Si acabas de pagar, espera unos segundos y vuelve a intentarlo.',
            );
          } else {
            setError('Hubo un problema al cargar el resumen de tu compra.');
          }
          return;
        }

        const data = (await res.json()) as PublicOrderResponse;
        setOrder(data);
      } catch (err) {
        console.error(err);
        setError('Hubo un problema al cargar el resumen de tu compra.');
      } finally {
        setLoading(false);
        // una vez usado, podemos limpiar el pending
        window.localStorage.removeItem('tiketera_pending_payment');
      }
    }

    void load();
  }, []);

  const handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#020617',
          color: '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <p>Cargando resumen de tu compra...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        padding: '24px 16px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '960px',
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
          gap: '24px',
        }}
      >
        {/* Columna izquierda: mensaje principal */}
        <section
          style={{
            background: '#020617',
            borderRadius: '16px',
            border: '1px solid #1f2937',
            padding: '16px 20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '999px',
                background: '#022c22',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #16a34a',
              }}
            >
              <span style={{ color: '#22c55e', fontSize: '18px' }}>✓</span>
            </div>
            <div>
              <h1
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: '2px',
                }}
              >
                Compra exitosa
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#9ca3af',
                }}
              >
                Gracias por tu compra. Aquí tienes el resumen de tus tickets.
              </p>
            </div>
          </div>

          {error && (
            <div
              style={{
                marginTop: '16px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: '#451a1a',
                border: '1px solid #f97316',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          )}

          {!error && order && (
            <>
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: '#020617',
                  border: '1px solid #1f2937',
                }}
              >
                <p
                  style={{
                    fontSize: '13px',
                    color: '#9ca3af',
                    marginTop: 0,
                    marginBottom: '6px',
                  }}
                >
                  Orden #{order.id}
                </p>

                <h2
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    margin: 0,
                    marginBottom: '4px',
                  }}
                >
                  {order.event.title}
                </h2>

                <p
                  style={{
                    fontSize: '14px',
                    margin: 0,
                    marginBottom: '4px',
                  }}
                >
                  {formatDateTime(order.event.startDateTime)}
                </p>

                <p
                  style={{
                    fontSize: '14px',
                    margin: 0,
                    color: '#9ca3af',
                  }}
                >
                  {order.event.venueName} · {order.event.venueAddress}
                </p>
              </div>

              <div style={{ marginTop: '16px' }}>
                <button
                  onClick={handleGoHome}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '999px',
                    border: '1px solid #4b5563',
                    background: 'transparent',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Volver al inicio
                </button>
              </div>
            </>
          )}
        </section>

        {/* Columna derecha: tickets + QR */}
        <section
          style={{
            background: '#020617',
            borderRadius: '16px',
            border: '1px solid #1f2937',
            padding: '16px 20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              margin: 0,
              marginBottom: '10px',
            }}
          >
            Tus tickets
          </h2>

          {!error && !order && (
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>
              No encontramos tickets para esta compra.
            </p>
          )}

          {order && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: '12px',
              }}
            >
              {order.tickets.map((t) => {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  t.code,
                )}`;

                return (
                  <div
                    key={t.code}
                    style={{
                      borderRadius: '12px',
                      border: '1px solid #1f2937',
                      padding: '12px 14px',
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: '12px',
                      alignItems: 'center',
                      background: '#020617',
                    }}
                  >
                    <div
                      style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '8px',
                        background: '#020617',
                        border: '1px solid #111827',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={qrUrl}
                        alt={`QR ticket ${t.code}`}
                        width={120}
                        height={120}
                        style={{ display: 'block' }}
                      />
                    </div>

                    <div>
                      <p
                        style={{
                          fontSize: '14px',
                          margin: 0,
                          marginBottom: '4px',
                        }}
                      >
                        <strong>Código:</strong> {t.code}
                      </p>
                      <p
                        style={{
                          fontSize: '13px',
                          margin: 0,
                          marginBottom: '8px',
                          color: '#9ca3af',
                        }}
                      >
                        Estado:{' '}
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            border: '1px solid #374151',
                          }}
                        >
                          {statusLabel(t.status)}
                        </span>
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          fontSize: '13px',
                        }}
                      >
                        <a
                          href={qrUrl}
                          download={`ticket-${t.code}.png`}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '999px',
                            border: '1px solid #4b5563',
                            background: 'transparent',
                            color: '#e5e7eb',
                            textDecoration: 'none',
                          }}
                        >
                          Descargar QR
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard
                              ?.writeText(t.code)
                              .catch(() => undefined);
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '999px',
                            border: 'none',
                            background: '#111827',
                            color: '#e5e7eb',
                            cursor: 'pointer',
                          }}
                        >
                          Copiar código
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}