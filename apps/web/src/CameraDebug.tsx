// src/CameraDebug.tsx
import { useEffect, useRef, useState } from 'react';

export function CameraDebug() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<string>('Inicializando cámara...');

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function init() {
      try {
        const video = videoRef.current;
        if (!video) return;

        if (
          typeof navigator === 'undefined' ||
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getUserMedia
        ) {
          throw new Error('getUserMedia no soportado en este navegador');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        video.srcObject = stream;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.then === 'function') {
          await playPromise;
        }

        setStatus(`playing: ${video.videoWidth}x${video.videoHeight}`);
        console.log(
          '[CameraDebug] playing',
          video.videoWidth,
          video.videoHeight
        );
      } catch (err) {
        console.error('[CameraDebug] error', err);
        setStatus('Error al iniciar la cámara');
      }
    }

    void init();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 12 }}>{status}</p>
      <video
        ref={videoRef}
        style={{
          width: '100%',
          maxWidth: 320,
          borderRadius: 8,
          border: '1px solid #4b5563',
          background: '#020617',
        }}
        muted
        playsInline
      />
    </div>
  );
}
