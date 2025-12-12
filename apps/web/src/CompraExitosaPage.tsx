// apps/web/src/CompraExitosaPage.tsx
import React, { useEffect, useState, useRef } from 'react';
import { API_BASE_URL } from './api';
import { jsPDF } from 'jspdf';

type PublicOrderResponse = {
  id: string;
  event: {
    title: string;
    description?: string;
    startDateTime: string;
    venueName: string;
    venueAddress: string;
  };
  buyerEmail: string;
  buyerName: string;
  tickets: {
    code: string;
    status: string;
  }[];
};

const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 3000;

// Helper para traer el QR como dataURL (base64) para jsPDF
async function fetchQrDataUrl(code: string, size = 260): Promise<string> {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    code
  )}`;

  const res = await fetch(url);
  const blob = await res.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function CompraExitosaPage() {
  const [order, setOrder] = useState<PublicOrderResponse | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'waiting' | 'not-found' | 'error' | 'done'
  >('loading');

  // El ref lo dejamos por si quieres usarlo luego,
  // pero ya no lo usamos para el PDF.
  const cardRef = useRef<HTMLDivElement | null>(null);

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

  // ✅ Generar PDF real, no pantallazo
  const handleDownloadPdf = async () => {
    if (!order || order.tickets.length === 0) return;

    try {
      // Primero cargamos todos los QRs como dataURL
      const qrDataUrls = await Promise.all(
        order.tickets.map((t) => fetchQrDataUrl(t.code, 260))
      );

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      order.tickets.forEach((ticket, index) => {
        if (index > 0) {
          pdf.addPage();
        }

        let y = 20;

        // Título del evento
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(20);
        pdf.setTextColor(55, 65, 81); // gris oscuro
        pdf.text(order.event.title, pageWidth / 2, y, { align: 'center' });

        y += 10;

        // Subtítulo "Compra exitosa"
        pdf.setFontSize(16);
        pdf.setTextColor(22, 163, 74); // verde
        pdf.text('Compra exitosa', pageWidth / 2, y, { align: 'center' });

        y += 10;

        // Email comprador
        if (order.buyerEmail) {
          pdf.setFontSize(11);
          pdf.setTextColor(55, 65, 81);
          pdf.setFont('helvetica', 'normal');
          pdf.text(order.buyerEmail, pageWidth / 2, y, {
            align: 'center',
          });
          y += 8;
        }

        // Datos del evento
        pdf.setFontSize(11);
        pdf.setTextColor(17, 24, 39);
        const fechaTexto = formatDateTime(order.event.startDateTime);
        pdf.text(
          `Fecha - Horario: ${fechaTexto}`,
          pageWidth / 2,
          y,
          { align: 'center' }
        );
        y += 6;
        pdf.text(
          `Dirección: ${order.event.venueName} – ${order.event.venueAddress}`,
          pageWidth / 2,
          y,
          { align: 'center', maxWidth: pageWidth - 30 }
        );

        y += 14;

        // Etiqueta bonita "Ticket X de N"
        pdf.setFontSize(11);
        pdf.setTextColor(31, 41, 55);
        const label = `Ticket ${index + 1} de ${order.tickets.length}`;
        pdf.text(label, pageWidth / 2, y, { align: 'center' });

        y += 6;

        // QR centrado
        const qrSizeMm = 70; // tamaño del QR en mm
        const qrX = (pageWidth - qrSizeMm) / 2;
        const qrY = y;

        pdf.addImage(
          qrDataUrls[index],
          'PNG',
          qrX,
          qrY,
          qrSizeMm,
          qrSizeMm
        );

        y = qrY + qrSizeMm + 8;

        // Código del ticket debajo
        pdf.setFontSize(10);
        pdf.setTextColor(17, 24, 39);
        pdf.text(
          ticket.code,
          pageWidth / 2,
          y,
          { align: 'center', maxWidth: pageWidth - 30 }
        );

        y += 14;

        // Nota pequeña
        pdf.setFontSize(9);
        pdf.setTextColor(107, 114, 128);
        pdf.text(
          'Presenta este QR en la entrada del evento.',
          pageWidth / 2,
          y,
          { align: 'center' }
        );
      });

      const filename = `ticket-${order.id || 'compra'}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('Error generando PDF:', err);
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
    if (status === 'done' && order && order.tickets.length > 0) {
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
              fontSize: 32,
              lineHeight: 1.1,
              color: '#374151',
              fontWeight: 700,
            }}
          >
            {order.event.title}
          </h1>

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

          {/* 🔹 Aquí mostramos TODOS los tickets con un chip "Ticket X de N" más bonito */}
          <div
            style={{
              marginTop: 12,
              marginBottom: 10,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            {order.tickets.map((ticket, index) => (
              <div
                key={ticket.code}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  maxWidth: 220,
                }}
              >
                <div
                  style={{
                    marginBottom: 6,
                    padding: '2px 10px',
                    borderRadius: 999,
                    backgroundColor: '#e5e7eb',
                    color: '#111827',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >
                  Ticket {index + 1}
                  {order.tickets.length > 1
                    ? ` de ${order.tickets.length}`
                    : ''}
                </div>

                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                    ticket.code
                  )}`}
                  width={220}
                  height={220}
                  alt={`QR ticket ${ticket.code}`}
                  style={{
                    background: '#ffffff',
                    padding: 8,
                    borderRadius: 16,
                    border: '1px solid #e5e7eb',
                  }}
                />
                <p
                  style={{
                    margin: 4,
                    fontSize: 12,
                    color: '#111827',
                    wordBreak: 'break-all',
                  }}
                >
                  {ticket.code}
                </p>
              </div>
            ))}
          </div>

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
        backgroundColor: '#6b6b6b',
        padding: '24px 12px',
        boxSizing: 'border-box',
      }}
    >
      {renderContent()}
    </div>
  );
}
