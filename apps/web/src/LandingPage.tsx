// apps/web/src/LandingPage.tsx
import React from 'react';

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #111827 0, #020617 40%, #000 100%)',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header simple */}
      <header
        style={{
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(148,163,184,0.25)',
        }}
      >
        <div>
          <span style={{ fontWeight: 700, fontSize: 20 }}>
            <span style={{ color: '#0400ff' }}>TICKET</span>-
            <span style={{ color: '#ff1f1f' }}>CHILE</span>
          </span>
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
            Tu entrada más rápida al evento.
          </p>
        </div>

        <nav style={{ display: 'flex', gap: 8, fontSize: 14 }}>
          <a
            href="/eventos"
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: '#1d4ed8',
              color: '#e5e7eb',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Ver eventos
          </a>
          <a
            href="/eventos?login=1"
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid #4b5563',
              color: '#e5e7eb',
              textDecoration: 'none',
            }}
          >
            Soy organizador
          </a>
        </nav>
      </header>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 960,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
            gap: 32,
          }}
        >
          {/* Texto */}
          <section>
            <h1
              style={{
                fontSize: 40,
                lineHeight: 1.1,
                marginBottom: 16,
              }}
            >
              Vende y compra entradas{' '}
              <span style={{ color: '#22c55e' }}>en minutos</span>
            </h1>
            <p
              style={{
                fontSize: 16,
                opacity: 0.85,
                maxWidth: 520,
                marginBottom: 20,
              }}
            >
              Publica tu evento, cobra online y valida tickets con código QR.
              Sin contratos raros, sin complicaciones.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <a
                href="/eventos"
                style={{
                  padding: '10px 20px',
                  borderRadius: 999,
                  background:
                    'linear-gradient(135deg, #22c55e, #16a34a, #22c55e)',
                  color: '#022c22',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: 15,
                  boxShadow: '0 12px 32px rgba(34,197,94,0.25)',
                }}
              >
                Ver eventos disponibles
              </a>

              <a
                href="/eventos?login=1"
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: '1px solid #4b5563',
                  color: '#e5e7eb',
                  textDecoration: 'none',
                  fontSize: 14,
                }}
              >
                Crear mi evento
              </a>
            </div>

            <p
              style={{
                fontSize: 12,
                opacity: 0.65,
                marginTop: 16,
              }}
            >
              Validación con QR en puerta, envío automático de tickets por
              correo y control de acceso en tiempo real.
            </p>
          </section>

          {/* Tarjeta visual */}
          <section
            style={{
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 360,
                background: '#020617',
                borderRadius: 24,
                border: '1px solid #1f2937',
                padding: 20,
                boxShadow: '0 18px 45px rgba(0,0,0,0.6)',
              }}
            >
              <h2
                style={{
                  fontSize: 18,
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                Velada de Boxeo
              </h2>
              <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                Las mejores peleas del año. Transmisión por streaming y acceso
                presencial.
              </p>

              <div
                style={{
                  fontSize: 13,
                  opacity: 0.9,
                  marginBottom: 12,
                }}
              >
                <div>
                  <strong>Fecha:</strong> 19-12-2025, 7:30 p. m.
                </div>
                <div>
                  <strong>Lugar:</strong> club san joaquín · calle 12
                </div>
                <div>
                  <strong>Organiza:</strong> Juan Organizador
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  background: '#020617',
                  border: '1px dashed #334155',
                  padding: 12,
                  textAlign: 'center',
                  fontSize: 12,
                  opacity: 0.85,
                }}
              >
                Tus asistentes reciben un QR único en su correo.  
                Tú lo escaneas en la puerta y listo.
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer mini */}
      <footer
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #1f2937',
          fontSize: 12,
          opacity: 0.65,
          textAlign: 'center',
        }}
      >
        © {new Date().getFullYear()} TicketChile. Todos los derechos
        reservados.
      </footer>
    </div>
  );
}
