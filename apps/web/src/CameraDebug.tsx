import { useEffect, useRef } from 'react';

export function CameraDebug() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();

        console.log(
          '[CameraDebug] playing',
          video.videoWidth,
          video.videoHeight,
        );
      } catch (err) {
        console.error('[CameraDebug] error', err);
      }
    }

    void start();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      style={{ width: '100%', maxWidth: 320, borderRadius: 8 }}
      muted
      playsInline
    />
  );
}
