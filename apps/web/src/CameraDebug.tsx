// apps/web/src/CameraDebug.tsx
import { useEffect, useRef, useState } from 'react';

export function CameraDebug() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string>('idle');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stream: MediaStream | null = null;

    async function start() {
      try {
        if (!window.isSecureContext) {
          throw new Error(
            `Contexto inseguro: ${location.protocol}//${location.host}. Necesitas https o http://localhost`
          );
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('navigator.mediaDevices.getUserMedia no está disponible');
        }

        setInfo('pidiendo cámara...');

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // trasera si existe
          },
          audio: false,
        });

        video.srcObject = stream;
        await video.play();

        setInfo(
          `playing: ${video.videoWidth}x${video.videoHeight}`
        );
        console.log('[CameraDebug] playing', video.videoWidth, video.videoHeight);
      } catch (err) {
        console.error('[CameraDebug] error', err);
        setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }
    }

    start().catch((err) => {
      console.error('[CameraDebug] error inesperado', err);
      setError(String(err));
    });

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        height: 320,
        borderRadius: 12,
        overflow: 'hidden',
        border: '2px solid red',
        background: '#000',
        position: 'relative',
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
          background: '#111',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          fontSize: 10,
          color: '#e5e7eb',
          textShadow: '0 1px 2px #000',
        }}
      >
        {info}
      </div>

      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 4,
            borderRadius: 8,
            background: 'rgba(15,23,42,0.9)',
            color: '#fecaca',
            fontSize: 12,
            padding: 8,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
