"use client";

import { useEffect, useRef } from "react";

export default function QrScanner({
  onScan,
  paused,
}: {
  onScan: (decodedText: string) => void;
  paused: boolean;
}) {
  const containerId = "qr-reader";
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            const now = Date.now();
            // Debounce duplicate scans of the same code within 3s
            if (
              lastScanRef.current.text === decodedText &&
              now - lastScanRef.current.at < 3000
            ) {
              return;
            }
            lastScanRef.current = { text: decodedText, at: now };
            onScan(decodedText);
          },
          () => {
            // ignore per-frame scan failures (no QR in view)
          }
        );
      } catch {
        // camera not available/permitted — PIN entry remains usable
      }
    }

    start();

    return () => {
      cancelled = true;
      scannerRef.current
        ?.stop()
        .then(() => scannerRef.current?.clear())
        .catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div id={containerId} className="rounded-xl overflow-hidden w-full" />
      {paused && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl">
          <span className="text-sm text-slate-500">Processing…</span>
        </div>
      )}
    </div>
  );
}
