import { useEffect, useRef, useState } from "react";

type SignaturePadProps = {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  label: string;
};

export default function SignaturePad({ value, onChange, disabled, hasError, label }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!value) {
      setHasInk(false);
      return;
    }
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
    setHasInk(true);
  }, [value]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.strokeStyle = "#0f172a";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(current.x, current.y);
    context.stroke();
    setHasInk(true);
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    drawingRef.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  };

  const clear = () => {
    if (disabled) return;
    onChange("");
    setHasInk(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={900}
        height={220}
        aria-label={`${label} signature pad`}
        className={`h-40 w-full touch-none rounded-lg border bg-white ${hasError ? "border-red-400 ring-2 ring-red-400/30" : "border-blue-300/50"} ${disabled ? "cursor-not-allowed opacity-70" : "cursor-crosshair"}`}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-blue-200/60">{hasInk ? "Signature captured" : "Sign with a mouse or finger"}</span>
        <button type="button" onClick={clear} disabled={disabled || !hasInk} className="rounded-md border border-blue-400/40 px-3 py-1.5 text-xs font-semibold text-blue-100 disabled:opacity-40">
          Clear Signature
        </button>
      </div>
    </div>
  );
}
