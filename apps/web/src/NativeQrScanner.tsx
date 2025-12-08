import { useEffect, useRef } from 'react';

interface NativeQrScannerProps {
  onResult: (text: string) => void;
  onError?: (err: unknown) => void;
}

export function NativeQrScanner({ onResult, onError }: NativeQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    async function start() {
      try {
        const hasBarcodeDetector =
          typeof (window as any).BarcodeDetector === 'function';

        if (!hasBarcodeDetector) {
          throw new Error('BarcodeDetector no soportado');
        }

        const BarcodeDetectorCtor = (window as any)
          .BarcodeDetector as new (formats: string[]) => {
          detect: (image: CanvasImageSource) => Promise<{ rawValue: string }[]>;
        };

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const detector = new BarcodeDetectorCtor(['qr_code']);

        const loop = async () => {
          if (stopped) return;
          const v = videoRef.current;
          if (!v || v.readyState < 2) {
            requestAnimationFrame(loop);
            return;
          }

          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          if (!ctx) {
            requestAnimationFrame(loop);
            return;
          }

          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

          try {
            const codes = await detector.detect(canvas);
            if (codes.length > 0) {
              onResult(codes[0].rawValue);
              return;
            }
          } catch (err) {
            onError?.(err);
          }

          requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
      } catch (err) {
        onError?.(err);
      }
    }

    void start();

    return () => {
      stopped = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [onResult, onError]);

  return (
    <video
      ref={videoRef}
      style={{ width: '100%', maxWidth: 320, borderRadius: 8 }}
      muted
      playsInline
    />
  );
}
