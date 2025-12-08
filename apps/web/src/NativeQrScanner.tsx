// apps/web/src/NativeQrScanner.tsx
import { useEffect, useRef } from 'react';
declare const BarcodeDetector: any;
interface NativeQrScannerProps {
  onResult: (text: string) => void;
  onError?: (error: unknown) => void;
}

export function NativeQrScanner({ onResult, onError }: NativeQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;           // o lanzar error, como prefieras
    video.srcObject = stream;
    video.play();

    let stream: MediaStream | null = null;
    let cancelled = false;
    let detector: BarcodeDetector | null = null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      onError?.(new Error('No se pudo crear el contexto 2D para el scanner.'));
      return;
    }

    async function start() {
      try {
        if (!window.isSecureContext) {
          throw new Error(
            `La cámara solo funciona en https o http://localhost (estás en ${location.protocol}//${location.host}).`
          );
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('navigator.mediaDevices.getUserMedia no está disponible.');
        }

        if (!('BarcodeDetector' in window)) {
          throw new Error(
            'BarcodeDetector no soportado en este navegador.'
          );
        }

        detector = new BarcodeDetector({ formats: ['qr_code'] });

        // 1) Pedimos cámara (idealmente la trasera)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // 2) Enchufamos el stream al <video>
        video.srcObject = stream;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if ((err as any)?.name === 'AbortError') {
              console.warn('[NativeQrScanner] play() abortado, probablemente doble montaje en dev.');
              return;
            }
            console.error('[NativeQrScanner] Error en play():', err);
            onError?.(err);
          });
        }

        // 3) Bucle de lectura con BarcodeDetector
        const loop = async () => {
          if (cancelled || !detector) return;

          if (!video.videoWidth || !video.videoHeight) {
            requestAnimationFrame(loop);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          try {
            const barcodes = await detector.detect(canvas);
            if (barcodes.length > 0) {
              const value = barcodes[0].rawValue;
              console.log('[NativeQrScanner] QR detectado:', value);
              onResult(value);
            }
          } catch (err) {
            // Errores de detección por frame se pueden ignorar
            console.debug('[NativeQrScanner] detect error frame:', err);
          }

          requestAnimationFrame(loop);
        };

        loop();
      } catch (err) {
        console.error('[NativeQrScanner] Error al iniciar scanner:', err);
        onError?.(err);
      }
    }

    start().catch((err) => {
      console.error('[NativeQrScanner] Error inesperado al iniciar:', err);
      onError?.(err);
    });

    return () => {
      cancelled = true;

      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      console.log('[NativeQrScanner] Cámara detenida.');
    };
  }, [onResult, onError]);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        height: 320,
        borderRadius: 12,
        overflow: 'hidden',
        border: '2px solid #22c55e',
        backgroundColor: '#000',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          backgroundColor: '#111',
        }}
      />
    </div>
  );
}
