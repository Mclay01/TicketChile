// apps/web/src/CompraExitosaPage.tsx
import React, { useEffect, useState, useRef } from 'react';
import { API_BASE_URL } from './api';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type PublicOrderResponse = {
  id: string;
  event: {
    title: string;
    description?: string; // opcional, por si el backend la envía (no la usamos en el diseño actual)
    startDateTime: string;
    venueName: string;
    venueAddress: string;
  };
  // opcionales, por si más adelante el backend manda estos datos
  buyerEmail?: string;
  buyerName?: string;
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

  // ref al “tarjetón” para convertirlo en PDF
  const cardRef = useRef<HTMLDivElement | null>(null);

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

  // Ahora genera un PDF y lo descarga directamente
  const handleDownloadPdf = async () => {
    if (!cardRef.current || !order) return;

    try {
      const element = cardRef.current;

      const canvas = await html2canvas(element, {
        scale: 2, // más resolución
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Dejamos márgenes y ajustamos la imagen al ancho de la página
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const x = margin;
      const y = Math.max(margin, (pageHeight - imgHeight) / 2);

      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
      const filename = `ticket-${order.id || 'compra'}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('Error generando PDF:', err);
      // fallback mínimo: si algo explota, al menos no deja el botón muerto
      if (typeof window !== 'undefined') {
        window.alert('No se pudo generar el PDF. Inténtalo nuevamente.');
      }
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

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('es-CL', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  const renderContent = () => {
    // Estado principal: tenemos la orden ⇒ mostramos la tarjeta como en el diseño
    if (status === 'done' && order && order.tickets.length > 0) {
      const firstTicket = order.tickets[0];

      return (
        <div
          ref={cardRef}
          style={{
            width: '100%',
            maxWidth: 520,
            backgroundColor: '#ffffff',
            borderRadius: 40,
            boxShadow: '0 18px 45px rgba(15,23,42,0.35)',
            padding: '32px 32px 36px',
            boxSizing: 'border-box',
            textAlign: 'center',
          }}
        >
          {/* Título del evento */}
          <h1
            style={{
              margin: 0,
              marginBottom: 8,
              fontSize: 32,
              lineHeight: 1.1,
              color: '#374151',
              fontWeight: 700,
            }}
          >
            {order.event.title}
          </h1>

          {/* "Compra exitosa" en verde */}
          <h2
            style={{
              margin: 0,
              marginBottom: 10,
              fontSize: 24,
              color: '#16a34a',
              fontWeight: 700,
            }}
          >
            Compra exitosa
          </h2>

          {/* Mensaje + correo del comprador (si viene) */}
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: '#4b5563',
            }}
          >
            Gracias por tu compra. Aquí tienes el resumen de tus tickets.
          </p>
          {order.buyerEmail && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 14,
                color: '#374151',
              }}
            >
              {order.buyerEmail}
            </p>
          )}

          {/* Info de fecha / dirección */}
          <div
            style={{
              marginTop: 14,
              marginBottom: 10,
              fontSize: 14,
              color: '#111827',
              textAlign: 'left',
            }}
          >
            <p style={{ margin: 0 }}>
              <strong>Fecha - Horario:</strong>{' '}
              <span style={{ color: '#374151' }}>
                {formatDateTime(order.event.startDateTime)}
              </span>
            </p>
            <p style={{ margin: '4px 0 0' }}>
              <strong>Dirección:</strong>{' '}
              <span style={{ color: '#374151' }}>
                {order.event.venueName} – {order.event.venueAddress}
              </span>
            </p>
          </div>

          {/* QR del ticket principal */}
          <div
            style={{
              marginTop: 12,
              marginBottom: 10,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                firstTicket.code
              )}`}
              width={260}
              height={260}
              alt={`QR ticket ${firstTicket.code}`}
              style={{
                background: '#ffffff',
                padding: 8,
                borderRadius: 16,
                border: '1px solid #e5e7eb',
              }}
            />
          </div>

          {/* Código debajo del QR */}
          <p
            style={{
              margin: 0,
              marginTop: 4,
              fontSize: 13,
              color: '#111827',
              wordBreak: 'break-all',
            }}
          >
            {firstTicket.code}
          </p>

          {/* Nota inferior */}
          <p
            style={{
              marginTop: 16,
              marginBottom: 16,
              fontSize: 12,
              color: '#6b7280',
            }}
          >
            Guarda este comprobante o descárgalo en PDF. También te enviamos los
            detalles al correo usado en la compra.
          </p>

          {/* Botón de descarga */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 20px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              background:
                'linear-gradient(135deg, #020617 0%, #111827 50%, #020617 100%)',
              color: '#f9fafb',
              boxShadow: '0 8px 22px rgba(15,23,42,0.45)',
              minWidth: 260,
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: '999px',
                border: '2px solid currentColor',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              ↓
            </span>
            Descargar comprobante (PDF)
          </button>
        </div>
      );
    }

    // Estados de espera / error envueltos en una tarjeta similar
    return (
      <div
        ref={cardRef}
        style={{
          width: '100%',
          maxWidth: 520,
          backgroundColor: '#ffffff',
          borderRadius: 40,
          boxShadow: '0 18px 45px rgba(15,23,42,0.35)',
          padding: '32px 32px 36px',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            marginBottom: 8,
            fontSize: 28,
            lineHeight: 1.1,
            color: '#374151',
            fontWeight: 700,
          }}
        >
          Compra exitosa
        </h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 14,
            color: '#4b5563',
          }}
        >
          {renderLeftMessage()}
        </p>
      </div>
    );
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#6b6b6b', // fondo gris como en la imagen
        padding: '24px 12px',
        boxSizing: 'border-box',
      }}
    >
      {renderContent()}
    </div>
  );
}
