import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QrScannerProps {
  /** Called on every frame a QR code is decoded in — repeatedly for as long as it stays in view, so the caller must debounce/ignore re-scans itself (e.g. while a pairing attempt from a previous scan is still in flight). */
  onScan: (data: string) => void;
}

type ScannerStatus = 'starting' | 'scanning' | 'insecure-context' | 'denied' | 'no-camera';

// Decodes QR codes from the device camera via jsQR (pure JS, works from plain canvas
// ImageData) rather than the native BarcodeDetector API, since BarcodeDetector isn't
// available in Safari/iOS at all — this needs to work on the phone in someone's hand
// pairing a screen, not just Chrome.
export function QrScanner({ onScan }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<ScannerStatus>('starting');
  // Avoids re-subscribing the whole getUserMedia effect just because the caller
  // passed a fresh onScan closure on every render.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    // getUserMedia only exists in a secure context (HTTPS or localhost). The normal
    // deployment for this hub is plain http://<nas-ip>:4000 on the LAN (see
    // hub/README.md) — over plain HTTP, most mobile browsers (iOS Safari in
    // particular) don't expose navigator.mediaDevices at all, so this fails here
    // rather than throwing a confusing error later.
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('insecure-context');
      return;
    }

    let cancelled = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick() {
      const video = videoRef.current;
      if (video && ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) onScanRef.current(code.data);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        setStatus('scanning');
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'no-camera');
      });

    return () => {
      cancelled = true;
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const message =
    status === 'insecure-context'
      ? 'Camera access needs a secure connection (HTTPS or localhost) — use "Enter IP" instead.'
      : status === 'denied'
        ? 'Camera permission denied — allow camera access and reopen this dialog, or use "Enter IP".'
        : status === 'no-camera'
          ? 'Could not access a camera — use "Enter IP" instead.'
          : null;

  return (
    <div className="qr-viewfinder">
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: message ? 'none' : 'block' }}
      />
      {message && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
          <p style={{ color: '#fff', fontSize: 11, textAlign: 'center', margin: 0 }}>{message}</p>
        </div>
      )}
      <span className="qr-corner tl" />
      <span className="qr-corner tr" />
      <span className="qr-corner bl" />
      <span className="qr-corner br" />
    </div>
  );
}
