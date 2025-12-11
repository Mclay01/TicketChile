// apps/web/src/CompraExitosaPage.tsx
import React, { useEffect, useState } from 'react';

// 🔹 IMPORTANTE: aquí apuntamos al API real en producción
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  'https://ticket-chile-api.onrender.com/api';

type TicketStatus = 'VALID' | 'USED' | 'CANCELLED';

interface TicketSummary {
  code: string;
  status: TicketStatus;
}

interface EventSummary {
  title: string;
  startDateTime: string;
  venueName: string;
  venueAddress: string;
}

interface PublicOrderSummary {
  id: string;
  event: EventSummary;
  tickets: TicketSummary[];
}

function formatDateTime(iso: string) {
  try {
    const date = new Date(iso);
    return date.toLocaleString('es-CL', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

const CompraExitosaPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrderSummary | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');

    if (!tokenFromUrl) {
      setError('No se encontró el identificador de la compra.');
      setLoading(false);
      return;
    }

    // Guardamos el token por si el usuario recarga la página
    try {
      window.localStorage.setItem('tiketera_last_flow_token', tokenFromUrl);
    } catch {
      // si localStorage falla, no pasa nada
    }

    const fetchSummary = async () => {
      try {
        setLoading(true);
        setError(null);

        const resp = await fetch(
          `${API_BASE_URL}/orders/public/by-flow-token?token=${encodeURIComponent(
            tokenFromUrl,
          )}`,
        );

        if (!resp.ok) {
          if (resp.status === 404) {
            setError(
              'Todavía no encontramos tu compra. Si el pago se acaba de completar, espera unos segundos y recarga la página.',
            );
            return;
          }

          setError('Hubo un problema al cargar el resumen de tu compra.');
          return;
        }

        const data = (await resp.json()) as PublicOrderSummary;
        setOrder(data);
      } catch (e) {
        console.error('Error cargando resumen de compra', e);
        setError('Hubo un problema al cargar el resumen de tu compra.');
      } finally {
        setLoading(false);
      }
    };

    void fetchSummary();
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        padding: '24px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1040px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1.4fr)',
          gap: '24px',
        }}
      >
        {/* Columna izquierda: mensaje principal */}
        <section
          style={{
            borderRadius: '16px',
            border: '1px solid #1f2937',
            padding: '20px 24px',
            background: '#020617',
            boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '999px',
                background: '#022c22',
                border: '1px solid #16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              ✓
            </div>
            <div>
              <h1
                style={{
                  fontSize: '22px',
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Compra exitosa
              </h1>
              <p
                style={{
                  margin: 0,
                  marginTop: 4,
                  fontSize: 14,
                  color: '#9ca3af',
                }}
              >
                Gracias por tu compra. Aquí tienes el resumen de tus tickets.
              </p>
            </div>
          </div>

          {loading && (
            <p style={{ fontSize: 14, color: '#9ca3af' }}>
              Cargando información de tu compra...
            </p>
          )}

          {!loading && error && (
            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#3f1f1f',
                border: '1px solid #f97316',
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && order && (
            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#020617',
                border: '1px solid #1f2937',
                fontSize: 14,
              }}
            >
              <p style={{ margin: 0, marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>Evento:</span>{' '}
                <strong>{order.event.title}</strong>
              </p>
              <p style={{ margin: 0, marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>Fecha:</span>{' '}
                {formatDateTime(order.event.startDateTime)}
              </p>
              <p style={{ margin: 0, marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>Lugar:</span>{' '}
                {order.event.venueName} · {order.event.venueAddress}
              </p>
              <p
                style={{
                  margin: 0,
                  marginTop: 8,
                  fontSize: 12,
                  color: '#6b7280',
                }}
              >
                Te enviamos también los tickets por correo electrónico.
              </p>
            </div>
          )}
        </section>

        {/* Columna derecha: lista de tickets */}
        <section
          style={{
            borderRadius: '16px',
            border: '1px solid #1f2937',
            padding: '20px 24px',
            background: '#020617',
            boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
            minHeight: 260,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
              marginBottom: 16,
            }}
          >
            Tus tickets
          </h2>

          {loading && (
            <p style={{ fontSize: 14, color: '#9ca3af' }}>
              Cargando tickets...
            </p>
          )}

          {!loading && !error && (!order || order.tickets.length === 0) && (
            <p style={{ fontSize: 14, color: '#9ca3af' }}>
              No encontramos tickets asociados a esta compra.
            </p>
          )}

          {!loading && !error && order && order.tickets.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                gap: 16,
              }}
            >
              {order.tickets.map((ticket) => (
                <article
                  key={ticket.code}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #1f2937',
                    padding: '12px 12px 14px',
                    background: '#020617',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.06,
                      color: '#9ca3af',
                      marginBottom: 4,
                    }}
                  >
                    Código
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: 'monospace',
                      fontSize: 13,
                      marginBottom: 8,
                      wordBreak: 'break-all',
                    }}
                  >
                    {ticket.code}
                  </p>

                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      marginBottom: 8,
                      color:
                        ticket.status === 'VALID'
                          ? '#4ade80'
                          : ticket.status === 'USED'
                          ? '#f97316'
                          : '#f87171',
                    }}
                  >
                    {ticket.status === 'VALID'
                      ? 'Válido'
                      : ticket.status === 'USED'
                      ? 'Usado'
                      : 'Cancelado'}
                  </p>

                  <div
                    style={{
                      marginTop: 6,
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#020617',
                      border: '1px dashed #1f2937',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        ticket.code,
                      )}`}
                      alt={`QR ticket ${ticket.code}`}
                      width={180}
                      height={180}
                      style={{ display: 'block' }}
                    />
                  </div>

                  <p
                    style={{
                      margin: 0,
                      marginTop: 6,
                      fontSize: 11,
                      color: '#6b7280',
                    }}
                  >
                    Puedes guardar esta imagen o mostrar el QR directamente en
                    la entrada.
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default CompraExitosaPage;
