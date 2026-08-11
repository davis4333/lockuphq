import { useEffect, useRef, useState } from "react";
import {
  SIGNATURE_LOGICAL_HEIGHT,
  SIGNATURE_LOGICAL_WIDTH,
  emptySignatureInkMetrics,
  isPlausibleSignatureInk,
  signatureBackingDimensions,
  type SignatureInkMetrics,
} from "./signatureInk";

type SignaturePadProps = {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  label: string;
};

type Point = { x: number; y: number };

export default function SignaturePad({
  value,
  onChange,
  disabled,
  hasError,
  label,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const committedInkRef = useRef(false);
  const lastPointRef = useRef<Point | undefined>(undefined);
  const metricsRef = useRef<SignatureInkMetrics>(emptySignatureInkMetrics());
  const [hasInk, setHasInk] = useState(false);

  const paintBlankCanvas = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  };

  const syncCanvasResolution = (canvas: HTMLCanvasElement): boolean => {
    const rect = canvas.getBoundingClientRect();
    const dimensions = signatureBackingDimensions(
      window.devicePixelRatio,
      rect.width,
      rect.height,
    );
    const changed =
      canvas.width !== dimensions.width || canvas.height !== dimensions.height;
    if (changed) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
    }
    canvas
      .getContext("2d")
      ?.setTransform(dimensions.scaleX, 0, 0, dimensions.scaleY, 0, 0);
    return changed;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    metricsRef.current = emptySignatureInkMetrics();
    committedInkRef.current = false;
    setHasInk(false);
    let active = true;

    const renderValue = () => {
      syncCanvasResolution(canvas);
      paintBlankCanvas(canvas);
      if (!value) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        context.drawImage(
          image,
          0,
          0,
          SIGNATURE_LOGICAL_WIDTH,
          SIGNATURE_LOGICAL_HEIGHT,
        );
        committedInkRef.current = true;
        setHasInk(true);
      };
      image.onerror = () => {
        if (!active) return;
        paintBlankCanvas(canvas);
        committedInkRef.current = false;
        setHasInk(false);
      };
      image.src = value;
    };

    const refreshResolution = () => {
      if (syncCanvasResolution(canvas)) renderValue();
    };

    renderValue();
    const observer = new ResizeObserver(refreshResolution);
    observer.observe(canvas);
    window.addEventListener("resize", refreshResolution);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", refreshResolution);
    };
  }, [value]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (SIGNATURE_LOGICAL_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (SIGNATURE_LOGICAL_HEIGHT / rect.height),
    };
  };

  const recordPoint = (current: Point) => {
    const metrics = metricsRef.current;
    const previous = lastPointRef.current;
    if (previous)
      metrics.distance += Math.hypot(
        current.x - previous.x,
        current.y - previous.y,
      );
    metrics.points += 1;
    metrics.minX = Math.min(metrics.minX, current.x);
    metrics.maxX = Math.max(metrics.maxX, current.x);
    metrics.minY = Math.min(metrics.minY, current.y);
    metrics.maxY = Math.max(metrics.maxY, current.y);
    lastPointRef.current = current;
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    lastPointRef.current = undefined;
    recordPoint(current);
    context.beginPath();
    context.moveTo(current.x, current.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    recordPoint(current);
    context.strokeStyle = "#0f172a";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(current.x, current.y);
    context.stroke();
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    drawingRef.current = false;
    lastPointRef.current = undefined;
    if (
      committedInkRef.current ||
      isPlausibleSignatureInk(metricsRef.current)
    ) {
      committedInkRef.current = true;
      setHasInk(true);
      onChange(event.currentTarget.toDataURL("image/png"));
    }
  };

  const clear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (canvas) paintBlankCanvas(canvas);
    drawingRef.current = false;
    committedInkRef.current = false;
    lastPointRef.current = undefined;
    metricsRef.current = emptySignatureInkMetrics();
    onChange("");
    setHasInk(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={SIGNATURE_LOGICAL_WIDTH}
        height={SIGNATURE_LOGICAL_HEIGHT}
        aria-label={`${label} signature pad`}
        className={`h-40 w-full touch-none rounded-lg border bg-white ${hasError ? "border-red-400 ring-2 ring-red-400/30" : "border-blue-300/50"} ${disabled ? "cursor-not-allowed opacity-70" : "cursor-crosshair"}`}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-blue-200/60">
          {hasInk
            ? "Signature captured"
            : "Sign with a mouse or finger; a tap or tiny mark will not count"}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="rounded-md border border-blue-400/40 px-3 py-1.5 text-xs font-semibold text-blue-100 disabled:opacity-40"
        >
          Clear Signature
        </button>
      </div>
    </div>
  );
}
