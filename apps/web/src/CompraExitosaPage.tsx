// apps/web/src/CompraExitosaPage.tsx
import { useEffect, useState } from 'react';
import { API_BASE_URL } from './api';

type TicketSummary = {
  code: string;
  status: string;
};

type OrderSummaryResponse = {
  id: string;
  event: {
    title: string;
    startDateTime: string;
    venueName: string;
    venueAddress: string;
  };
  tickets: TicketSummary[];
};

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function CompraExitosaPage() {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function load() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams(window.location.search);

      // 1) Intentamos sacar algo de la URL (?token=..., ?flow_token=..., ?flow_order=...)
      let token =
        params.get('token') ??
        params.get('flow_token') ??
        params.get('flowToken') ??
        params.get('flow_order') ??
        null;

      // 2) Si no viene en la URL, usamos lo que guardamos antes de ir a Flow
      if (!token) {
        const stored = window.localStorage.getItem('tiketera_last_flow_token');
        if (stored) {
          token = stored;
        }
      }

      if (!token) {
        setError('No se encontró el identificador de la compra.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE_URL}/orders/public/flow-order?token=${encodeURIComponent(
            token,
          )}`,
        );

        if (!res.ok) {
          if (res.status === 404) {
            setError(
              'Todavía no encontramos tu compra. Es posible que el pago siga procesándose. Actualiza en unos segundos o revisa tu correo.',
            );
            setLoading(false);
            return;
          }

          throw new Error('Error al cargar la compra');
        }

        const data = (await res.json()) as OrderSummaryResponse;
        setOrder(data);
      } catch (err) {
        console.error('[CompraExitosa] error cargando orden', err);
        setError('No se pudo cargar la información de la compra.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        padding: '32px 16px',
        color: '#e5e7eb',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: '720px' }}>
        <div
          style={{
            borderRadius: '20px',
            background:
              'radial-gradient(circle at top left, #16a34a33, #020617)',
            border: '1px solid #064e3b',
            padding: '20px 20px 16px',
            marginBottom: '16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '999px',
              background: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              boxShadow: '0 0 0 4px rgba(34,197,94,0.25)',
              flexShrink: 0,
            }}
          >
            ✓
          </div>

          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: '22px',
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Compra exitosa
            </h1>
            <p
              style={{
                fontSize: '14px',
                opacity: 0.85,
                marginBottom: 4,
              }}
            >
              Gracias por tu compra. Aquí tienes el resumen de tus tickets.
            </p>
          </div>
        </div>

        {loading && (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid #1f2937',
              background: '#020617',
              padding: '12px 14px',
              fontSize: 14,
            }}
          >
            Cargando información de tu compra...
          </div>
        )}

        {error && (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid #7f1d1d',
              background: '#450a0a',
              padding: '12px 14px',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {order && !loading && !error && (
          <div
            style={{
              borderRadius: 16,
              border: '1px solid #1f2937',
              background: '#020617',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {order.event.title}
              </h2>
              <p style={{ fontSize: 13, opacity: 0.85 }}>
                <strong>Fecha:</strong> {formatDateTime(order.event.startDateTime)}
                <br />
                <strong>Lugar:</strong> {order.event.venueName} ·{' '}
                {order.event.venueAddress}
              </p>
            </div>

            <div
              style={{
                borderTop: '1px solid #1f2937',
                paddingTop: 10,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Tus tickets
              </h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr)',
                  gap: 8,
                }}
              >
                {order.tickets.map((t) => (
                  <div
                    key={t.code}
                    style={{
                      borderRadius: 10,
                      border: '1px solid #1f2937',
                      padding: '10px 12px',
                      fontSize: 13,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div>
                        <strong>Código:</strong> {t.code}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.8,
                        }}
                      >
                        Presenta este código o el QR del correo en la entrada.
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid #16a34a55',
                        background: '#064e3b',
                      }}
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <a
                href="/"
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#1d4ed8',
                  color: '#e5e7eb',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Volver al inicio
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CompraExitosaPage;
