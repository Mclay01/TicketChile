// apps/web/src/LandingPage.tsx
import React from 'react';
import logoTicketChile from './assets/logo-ticketchile.png';

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        color: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* NAVBAR ROJO OSCURO CON LOGO */}
      <header
        style={{
          background: '#7f1d1d', // rojo oscuro
          color: '#f9fafb',
          padding: '12px 5vw',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
        }}
      >
        {/* LOGO (sin texto TICKET-CHILE) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/logo-ticketchile.png"
            alt="Ticketchile"
            className="tc-logo"
          />
        </div>

        {/* Navegación simple */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
          }}
        >
          <button
            onClick={() => {
              window.location.href = '/eventos';
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              background: '#16a34a',
              color: '#f9fafb',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ver eventos
          </button>
          <button
            onClick={() => {
              window.location.href = '/eventos?login=1';
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid rgba(248,250,252,0.5)',
              background: 'transparent',
              color: '#f9fafb',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Soy organizador
          </button>
        </nav>
      </header>

      {/* CONTENIDO PRINCIPAL (FONDO BLANCO) */}
      <main
        style={{
          flex: 1,
          padding: '32px 5vw 40px',
          boxSizing: 'border-box',
        }}
      >
        <section
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '32px',
            alignItems: 'center',
          }}
        >
          {/* Columna izquierda: texto */}
          <div
            style={{
              flex: '1 1 280px',
              minWidth: 0,
            }}
          >
            <h1
              style={{
                fontSize: 'clamp(32px, 4vw, 40px)',
                lineHeight: 1.1,
                marginBottom: 16,
              }}
            >
              Vende y compra entradas
              <br />
              <span style={{ color: '#16a34a' }}>en minutos</span>
            </h1>

            <p
              style={{
                fontSize: 16,
                maxWidth: 520,
                marginBottom: 20,
                color: '#4b5563',
              }}
            >
              Publica tu evento, cobra online y valida tickets con código QR.
              Sin contratos raros, sin complicaciones.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <button
                onClick={() => {
                  window.location.href = '/eventos';
                }}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Ver eventos disponibles
              </button>

              <button
                onClick={() => {
                  window.location.href = '/eventos?login=1';
                }}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  color: '#7f1d1d',
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Crear mi evento
              </button>
            </div>

            <p
              style={{
                fontSize: 13,
                color: '#6b7280',
              }}
            >
              Validación con QR en puerta, envío automático de tickets por
              correo y control de acceso en tiempo real.
            </p>
          </div>

          {/* Columna derecha: tarjeta de ejemplo de evento */}
          <div
            style={{
              flex: '1 1 320px',
              minWidth: 0,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: 24,
                background: '#020617',
                color: '#e5e7eb',
                padding: 20,
                boxShadow: '0 16px 40px rgba(15,23,42,0.45)',
                boxSizing: 'border-box',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  marginBottom: 8,
                  fontSize: 20,
                  fontWeight: 600,
                }}
              >
                Velada de Boxeo
              </h2>

              <p
                style={{
                  margin: 0,
                  marginBottom: 12,
                  fontSize: 14,
                  color: '#d1d5db',
                }}
              >
                Las mejores peleas del año. Transmisión por streaming y acceso
                presencial.
              </p>

              <div
                style={{
                  fontSize: 13,
                  color: '#9ca3af',
                  marginBottom: 12,
                }}
              >
                <p style={{ margin: '2px 0' }}>
                  <strong>Fecha:</strong> 19-12-2025, 7:30 p. m.
                </p>
                <p style={{ margin: '2px 0' }}>
                  <strong>Lugar:</strong> club san joaquín · calle 12
                </p>
                <p style={{ margin: '2px 0' }}>
                  <strong>Organiza:</strong> Juan Organizador
                </p>
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 18,
                  border: '1px dashed #1f2937',
                  fontSize: 12,
                  color: '#9ca3af',
                  textAlign: 'center',
                }}
              >
                Tus asistentes reciben un QR único en su correo. Tú lo escaneas
                en la puerta y listo.
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer
        style={{
          padding: '16px 5vw 24px',
          borderTop: '1px solid #e5e7eb',
          fontSize: 12,
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        © {new Date().getFullYear()} TicketChile. Todos los derechos
        reservados.
      </footer>
    </div>
  );
}
