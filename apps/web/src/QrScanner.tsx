// apps/web/src/QrScanner.tsx
import type { FC } from 'react';

export interface QrScannerProps {
  onResult?: (text: string) => void;
  onError?: (error: unknown) => void;
}

/**
 * Stub de QrScanner basado en ZXing.
 * Actualmente no se usa porque estamos usando NativeQrScanner
 * con BarcodeDetector. Se deja vacío para no romper el build.
 */
export const QrScanner: FC<QrScannerProps> = () => {
  return null;
};

export default QrScanner;
