"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera, AlertTriangle } from "lucide-react";

export type CameraCaptureHandle = {
  /** Snapshots the current video frame as a JPEG data URL, or null if the camera isn't ready. */
  capture: () => string | null;
};

type Props = {
  onReadyChange?: (ready: boolean) => void;
};

const CameraCapture = forwardRef<CameraCaptureHandle, Props>(function CameraCapture(
  { onReadyChange },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This device doesn't support camera access.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Camera access is required to check in. Please allow camera permission.");
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  useImperativeHandle(ref, () => ({
    capture: () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !ready) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    },
  }));

  return (
    <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3]">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center bg-slate-100">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
          <p className="text-xs text-slate-600">{error}</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedData={() => setReady(true)}
          className="w-full h-full object-cover -scale-x-100"
        />
      )}
      <canvas ref={canvasRef} className="hidden" />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
          <Camera className="w-6 h-6 text-white animate-pulse" />
        </div>
      )}
    </div>
  );
});

export default CameraCapture;
