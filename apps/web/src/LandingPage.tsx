// apps/web/src/LandingPage.tsx
import React, { useState } from 'react';
import logoTicketchile from './assets/logo-ticketchile.png';

const LandingPage: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const goToEvents = () => {
    window.location.href = '/eventos';
  };

  const goToOrganizer = () => {
    window.location.href = '/eventos?login=1';
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        color: '#111827',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* NAVBAR */}
      <header
        style={{
          backgroundColor: '#7b1414', // rojo oscuro
          color: '#f9fafb',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Logo grande */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={logoTicketchile}
              alt="TicketChile"
              style={{
                height: 44,
                width: 'auto',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* NAV DESKTOP */}
          <nav
            className="landing-nav-desktop"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: 14,
            }}
          >
            <button
              onClick={goToEvents}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                border: 'none',
                backgroundColor: '#f97373',
                color: '#111827',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 8px 18px rgba(0,0,0,0.22)',
              }}
            >
              Ver eventos
            </button>

            <button
              onClick={goToOrganizer}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                border: '1px solid rgba(249,250,251,0.6)',
                backgroundColor: 'transparent',
                color: '#f9fafb',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Soy organizador
            </button>
          </nav>

          {/* BOTÓN MENÚ MOBILE */}
          <button
            className="landing-nav-toggle"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Abrir menú"
            style={{
              display: 'none', // se muestra solo con el media query
              border: 'none',
              background: 'transparent',
              padding: 6,
              cursor: 'pointer',
            }}
          >
            {/* ícono hamburguesa más “pro” */}
            <div
              style={{
                width: 24,
                height: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    height: 2,
                    borderRadius: 999,
                    backgroundColor: '#f9fafb',
                    width: i === 1 ? 18 : 24,
                    alignSelf: i === 1 ? 'flex-end' : 'flex-start',
                    transition: 'transform 0.2s ease, width 0.2s ease',
                  }}
                />
              ))}
            </div>
          </button>
        </div>

        {/* NAV MOBILE DROPDOWN */}
        {mobileOpen && (
          <div
            className="landing-nav-mobile"
            style={{
              display: 'block',
              borderTop: '1px solid rgba(248,250,252,0.1)',
              backgroundColor: '#691010',
            }}
          >
            <div
              style={{
                maxWidth: '1200px',
                margin: '0 auto',
                padding: '8px 16px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <button
                onClick={goToEvents}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#f97373',
                  color: '#111827',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Ver eventos
              </button>

              <button
                onClick={goToOrganizer}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(249,250,251,0.6)',
                  backgroundColor: 'transparent',
                  color: '#f9fafb',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Soy organizador
              </button>
            </div>
          </div>
        )}
      </header>

      {/* CONTENIDO PRINCIPAL (similar al del .zip pero sin tarjetas de ejemplo) */}
      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 16px 40px',
          boxSizing: 'border-box',
        }}
      >
        {/* Hero */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.5fr)',
            gap: 32,
            alignItems: 'center',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '32px',
                lineHeight: 1.1,
                fontWeight: 800,
                color: '#111827',
                marginBottom: 12,
              }}
            >
              Vende y compra entradas
              <br />
              <span style={{ color: '#b91c1c' }}>en minutos</span>
            </h1>
            <p
              style={{
                fontSize: 16,
                color: '#4b5563',
                maxWidth: 520,
                marginBottom: 20,
              }}
            >
              Publica tu evento, cobra online y valida tickets con código QR.
              Sin contratos raros, sin complicaciones.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 18,
              }}
            >
              <button
                onClick={goToEvents}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    'linear-gradient(135deg, #ef4444, #b91c1c)',
                  color: '#f9fafb',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(185,28,28,0.35)',
                }}
              >
                Ver eventos disponibles
              </button>

              <button
                onClick={goToOrganizer}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  border: '1px solid #b91c1c',
                  backgroundColor: '#ffffff',
                  color: '#b91c1c',
                  fontWeight: 600,
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

          {/* Columna derecha vacía (solo diseño), SIN tarjeta de evento fake */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                minHeight: 220,
                borderRadius: 24,
                border: '1px dashed rgba(75,85,99,0.3)',
                background:
                  'radial-gradient(circle at top left, #fee2e2, #ffffff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                textAlign: 'center',
                color: '#4b5563',
                fontSize: 14,
              }}
            >
              Tus próximos eventos destacados aparecerán aquí.
            </div>
          </div>
        </section>
      </main>

      <footer
        style={{
          borderTop: '1px solid #e5e7eb',
          padding: '12px 16px',
          fontSize: 12,
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        © {new Date().getFullYear()} TicketChile. Todos los derechos reservados.
      </footer>
    </div>
  );
};

export default LandingPage;
