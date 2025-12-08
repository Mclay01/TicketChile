// src/QrScanner.tsx
import { useEffect } from 'react';

type QrScannerProps = {
  onResult: (text: string) => void;
  onError: (error: Error) => void;
};

export function QrScanner({ onError }: QrScannerProps) {
  useEffect(() => {
    // Fallback vacío: este componente no se usa en producción ahora.
    // Lo dejamos solo para que compile sin romper imports antiguos.
    onError(
      new Error(
        'QrScanner clásico deshabilitado en esta build. Usar NativeQrScanner.'
      )
    );
  }, [onError]);

  return null;
}
