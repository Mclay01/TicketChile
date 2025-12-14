// apps/web/src/LandingPage.tsx
import React from 'react';

export default function LandingPage() {
  function goToEventos() {
    if (typeof window !== 'undefined') {
      window.location.href = '/eventos';
    }
  }

  function goToOrganizer() {
    if (typeof window !== 'undefined') {
      window.location.href = '/eventos?login=1';
    }
  }

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
      {/* NAVBAR ROJO OSCURO */}
      <header
        style={{
          backgroundColor: '#7f1d1d', // rojo oscuro
          color: '#f9fafb',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.15)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <img
              src="/ticketchile-logo.png"
              alt="TicketChile"
              style={{
                height: 40,
                width: 'auto',
                objectFit: 'contain',
              }}
            />
          </div>

          {/* Botones derecha */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 14,
            }}
          >
            <button
              type="button"
              onClick={goToEventos}
              style={{
                padding: '7px 13px',
                borderRadius: 999,
                border: '1px solid rgba(248,250,252,0.4)',
                backgroundColor: 'transparent',
                color: '#f9fafb',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Ver eventos
            </button>

            <button
              type="button"
              onClick={goToOrganizer}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                border: 'none',
                background:
                  'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 50%, #450a0a 100%)',
                color: '#f9fafb',
                cursor: 'pointer',
                fontWeight: 600,
                boxShadow: '0 8px 18px rgba(0,0,0,0.35)',
              }}
            >
              Soy organizador
            </button>
          </nav>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 1200,
          margin: '0 auto',
          padding: '32px 16px 40px',
          boxSizing: 'border-box',
        }}
      >
        {/* HERO – SOLO TEXTO (SIN TARJETA EXTRA) */}
        <section
          style={{
            maxWidth: 900,
            margin: '0 auto 40px auto',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#b91c1c',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Tu entrada más rápida al evento
          </p>

          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.1,
              margin: 0,
              marginBottom: 12,
              color: '#111827',
            }}
          >
            Vive experiencias{' '}
            <span style={{ color: '#b91c1c' }}>inolvidables</span> en Chile
          </h1>

          <p
            style={{
              margin: 0,
              marginBottom: 20,
              fontSize: 15,
              color: '#4b5563',
              maxWidth: 600,
              marginInline: 'auto',
            }}
          >
            Encuentra y compra tickets para los mejores eventos en Chile.
            Si eres organizador, publica tu evento y vende entradas online
            en minutos.
          </p>

          {/* Botones hero */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 10,
              marginTop: 8,
              marginBottom: 18,
            }}
          >
            <button
              type="button"
              onClick={goToEventos}
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: 'none',
                background:
                  'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 50%, #450a0a 100%)',
                color: '#f9fafb',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
                boxShadow: '0 10px 22px rgba(127,29,29,0.45)',
              }}
            >
              Ver eventos disponibles
            </button>

            <button
              type="button"
              onClick={goToOrganizer}
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: '1px solid #b91c1c',
                backgroundColor: '#ffffff',
                color: '#7f1d1d',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Publicar mi evento
            </button>
          </div>

          {/* Pills / highlights */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 8,
              fontSize: 12,
            }}
          >
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                fontWeight: 500,
              }}
            >
              Pagos con Flow
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: '#fef3c7',
                color: '#92400e',
                fontWeight: 500,
              }}
            >
              QR para control de acceso
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: '#ede9fe',
                color: '#5b21b6',
                fontWeight: 500,
              }}
            >
              Panel organizador incluido
            </span>
          </div>
        </section>

        {/* Sección “Cómo funciona” */}
        <section
          style={{
            marginTop: 10,
            borderTop: '1px solid #e5e7eb',
            paddingTop: 24,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 12,
              color: '#111827',
              textAlign: 'center',
            }}
          >
            ¿Cómo funciona TicketChile?
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            <div
              style={{
                borderRadius: 16,
                border: '1px solid #fee2e2',
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: 4,
                  color: '#991b1b',
                }}
              >
                1. Crea tu evento
              </h3>
              <p
                style={{
                  fontSize: 13,
                  margin: 0,
                  color: '#4b5563',
                }}
              >
                Define fecha, lugar, capacidad y tipos de entradas desde el
                panel de organizador.
              </p>
            </div>

            <div
              style={{
                borderRadius: 16,
                border: '1px solid #fee2e2',
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: 4,
                  color: '#991b1b',
                }}
              >
                2. Vende online
              </h3>
              <p
                style={{
                  fontSize: 13,
                  margin: 0,
                  color: '#4b5563',
                }}
              >
                Tus asistentes compran con Flow y reciben sus tickets con QR
                por correo.
              </p>
            </div>

            <div
              style={{
                borderRadius: 16,
                border: '1px solid #fee2e2',
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: 4,
                  color: '#991b1b',
                }}
              >
                3. Controla el acceso
              </h3>
              <p
                style={{
                  fontSize: 13,
                  margin: 0,
                  color: '#4b5563',
                }}
              >
                Usa el lector de QR integrado para marcar tickets como usados y
                evitar duplicados.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer
        style={{
          borderTop: '1px solid #e5e7eb',
          padding: '10px 16px 14px',
          fontSize: 12,
          color: '#6b7280',
          textAlign: 'center',
          backgroundColor: '#f9fafb',
        }}
      >
        © {new Date().getFullYear()} TicketChile. Todos los derechos reservados.
      </footer>
    </div>
  );
}
