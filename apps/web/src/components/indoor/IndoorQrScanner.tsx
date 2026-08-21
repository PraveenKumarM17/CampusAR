import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

type IndoorQrScannerProps = {
  onScan: (decodedText: string) => void;
  onError?: (message: string) => void;
};

export function IndoorQrScanner({
  onScan,
  onError,
}: IndoorQrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;

      if (scanner) {
        void scanner.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  const startScanner = async () => {
    setCameraError(null);

    try {
      const scanner = new Html5Qrcode('indoor-qr-reader');

      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          try {
            await scanner.stop();
          } catch {
            // Scanner may already be stopped.
          }

          scannerRef.current = null;
          setScanning(false);

          onScan(decodedText);
        },
        () => {
          // QR code not detected yet.
        },
      );

      setScanning(true);
    } catch (error) {
      scannerRef.current = null;
      setScanning(false);

      setCameraError(
        'Camera access was denied or the camera is unavailable.',
      );

      onError?.(
        error instanceof Error
          ? error.message
          : 'Unable to access the camera.',
      );
    }
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;

    if (!scanner) {
      return;
    }

    try {
      await scanner.stop();
    } catch {
      // Scanner may already be stopped.
    }

    scannerRef.current = null;
    setScanning(false);
  };

  return (
    <div>
      <div
        id="indoor-qr-reader"
        style={{
          width: '100%',
          maxWidth: '420px',
          margin: '0 auto',
        }}
      />

      {!scanning && (
        <button type="button" onClick={() => void startScanner()}>
          Scan QR with Camera
        </button>
      )}

      {scanning && (
        <button type="button" onClick={() => void stopScanner()}>
          Stop Camera
        </button>
      )}

      {cameraError && (
        <p role="alert">
          {cameraError}
        </p>
      )}
    </div>
  );
}