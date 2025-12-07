// apps/web/src/QrScanner.tsx
import { useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface QrScannerProps {
  onResult: (text: string) => void;
  onError?: (error: unknown) => void;
}

export function QrScanner({ onResult, onError }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    // ZXing
    const reader = new BrowserMultiFormatReader();

    // Canvas interno para leer los frames
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

        // 1) Pedimos la cámara
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
            // En dev con React.StrictMode se llama dos veces y salta AbortError: ignorarlo
            if (err && (err as any).name === 'AbortError') {
              console.warn('[QrScanner] play() abortado (doble montaje en dev).');
              return;
            }
            console.error('[QrScanner] Error en play():', err);
            onError?.(err);
          });
        }

        // 3) Bucle de lectura con ZXing
        const loop = async () => {
          if (cancelled) return;

          // Hasta que el video tenga tamaño
          if (!video.videoWidth || !video.videoHeight) {
            requestAnimationFrame(loop);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          try {
            const result = await reader.decodeFromCanvas(canvas);
            if (result) {
              const text = result.getText();
              console.log('[QrScanner] QR detectado:', text);
              onResult(text);
            }
          } catch (err: any) {
            const name = String(err?.name ?? '');

            // No encontró nada en este frame: es lo normal, ignorar
            if (name.includes('NotFoundException')) {
              // seguir escaneando
            } else {
              console.error('[QrScanner] Error al leer QR:', err);
              onError?.(err);
            }
          }

          requestAnimationFrame(loop);
        };

        loop();
      } catch (err) {
        console.error('[QrScanner] Error al iniciar cámara:', err);
        onError?.(err);
      }
    }

    start().catch((err) => {
      console.error('[QrScanner] Error inesperado al iniciar:', err);
      onError?.(err);
    });

    return () => {
      cancelled = true;

      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      reader.reset();
      console.log('[QrScanner] Cámara detenida y reader reseteado');
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
