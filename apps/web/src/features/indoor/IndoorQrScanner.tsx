import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export function IndoorQrScanner({
  onScan,
  onClose,
}: {
  onScan: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let cancelled = false;

    void (async () => {
      const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (!Detector) {
        setError('QR scanning is not supported in this browser. Enter the marker code manually.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              onScan(value);
              return;
            }
          } catch {
            // A frame can fail while the camera is focusing; keep scanning.
          }
          timer = window.setTimeout(scan, 180);
        };
        void scan();
      } catch {
        setError('Camera permission was denied. Enter the marker code manually.');
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[3000] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between border-b border-white/20 p-3">
        <p className="inline-flex items-center gap-2 font-semibold">
          <Camera size={18} /> Scan indoor marker
        </p>
        <button type="button" className="rounded p-2 hover:bg-white/10" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-64 w-64 rounded-xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      </div>
      <div className="p-4 text-center text-sm">
        {error ?? 'Point the camera at a CampusAR QR marker.'}
      </div>
    </div>
  );
}
