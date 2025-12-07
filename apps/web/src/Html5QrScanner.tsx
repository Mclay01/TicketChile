// apps/web/src/Html5QrScanner.tsx
import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Html5QrScannerProps {
  onResult: (text: string) => void;
  onError?: (error: unknown) => void;
}

export function Html5QrScanner({ onResult, onError }: Html5QrScannerProps) {
  const divIdRef = useRef(`qr-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const elementId = divIdRef.current;
    const html5QrCode = new Html5Qrcode(elementId);
    let cancelled = false;

    async function start() {
      try {
        await html5QrCode.start(
          { facingMode: 'environment' }, // cámara trasera cuando haya
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText /*, decodedResult*/) => {
            if (cancelled) return;
            console.log('[Html5QrScanner] QR detectado:', decodedText);
            onResult(decodedText);
          },
          (errorMessage) => {
            // Se llama MUCHO, mejor no spamear consola,
            // pero lo dejo por si quieres inspeccionar
            // console.log('[Html5QrScanner] no QR en frame:', errorMessage);
          }
        );
      } catch (err) {
        console.error('[Html5QrScanner] error al iniciar', err);
        onError?.(err);
      }
    }

    start().catch((err) => {
      console.error('[Html5QrScanner] error inesperado', err);
      onError?.(err);
    });

    return () => {
      cancelled = true;
      html5QrCode
        .stop()
        .then(() => html5QrCode.clear())
        .catch(() => {
          // ignoramos error al parar/limpiar
        });
    };
  }, [onResult, onError]);

  return (
    <div
      id={divIdRef.current}
      style={{
        width: '100%',
        maxWidth: 420,
        margin: '0 auto',
        borderRadius: 12,
        overflow: 'hidden',
        border: '2px solid #22c55e',
      }}
    />
  );
}
