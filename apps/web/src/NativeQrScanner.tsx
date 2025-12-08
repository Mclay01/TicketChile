// src/NativeQrScanner.tsx
import { useEffect, useRef } from 'react';

type NativeQrScannerProps = {
  onResult: (text: string) => void;
  onError: (error: Error) => void;
};

export function NativeQrScanner({ onResult, onError }: NativeQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    async function init() {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) return;

        if (
          typeof navigator === 'undefined' ||
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getUserMedia
        ) {
          throw new Error('getUserMedia no soportado');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        video.srcObject = stream;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.then === 'function') {
          await playPromise;
        }

        // BarcodeDetector nativo
        if (
          typeof window === 'undefined' ||
          !(window as any).BarcodeDetector
        ) {
          throw new Error(
            'BarcodeDetector no soportado en este navegador. Prueba Chrome/Android reciente.'
          );
        }

        const DetectorCtor = (window as any).BarcodeDetector;
        const detector: any = new DetectorCtor({ formats: ['qr_code'] });

        const ctx = canvas.getContext('2d');

        async function tick() {
          if (stopped) return;

          const v = videoRef.current;
          const c = canvasRef.current;

          if (!v || !c || !ctx) {
            return requestAnimationFrame(tick);
          }

          if (!v.videoWidth || !v.videoHeight) {
            return requestAnimationFrame(tick);
          }

          c.width = v.videoWidth;
          c.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, c.width, c.height);

          try {
            const detections = await detector.detect(c);
            if (detections && detections.length > 0) {
              const value = detections[0].rawValue;
              onResult(value);
            }
          } catch (err) {
            console.error('BarcodeDetector error', err);
          }

          requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
      } catch (err) {
        console.error('NativeQrScanner init error', err);
        onError(err instanceof Error ? err : new Error('Error cámara'));
      }
    }

    void init();

    return () => {
      stopped = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [onResult, onError]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <video
        ref={videoRef}
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 8,
          border: '1px solid #4b5563',
          background: '#020617',
        }}
        muted
        playsInline
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
