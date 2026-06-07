import { useEffect, useRef } from "react";

export default function BackgroundEffects() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    type Particle = {
      x: number; y: number; size: number;
      vx: number; vy: number; opacity: number; phase: number;
    };

    const particles: Particle[] = Array.from({ length: 75 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.1 + 0.2,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -(Math.random() * 0.22 + 0.05),
      opacity: Math.random() * 0.38 + 0.05,
      phase: Math.random() * Math.PI * 2,
    }));

    let rafId: number;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.phase += 0.016;
        if (p.y < -4) { p.y = canvas.height + 4; p.x = Math.random() * canvas.width; }
        if (p.x < -4) p.x = canvas.width + 4;
        if (p.x > canvas.width + 4) p.x = -4;
        const a = p.opacity * (0.55 + 0.45 * Math.sin(p.phase));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(60,160,255,${a.toFixed(3)})`;
        ctx.fill();
      }
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes fog-slow {
          0%,100% { opacity:.14; transform:translateX(0) scaleX(1); }
          50%      { opacity:.22; transform:translateX(1.5%) scaleX(1.05); }
        }
        @keyframes fog-slow2 {
          0%,100% { opacity:.09; transform:translateX(0) scaleX(1); }
          50%      { opacity:.17; transform:translateX(-1.5%) scaleX(1.07); }
        }
        @keyframes ray-left {
          0%,100% { opacity:.07; }
          55%      { opacity:.14; }
        }
        @keyframes ray-right {
          0%,100% { opacity:.06; }
          45%      { opacity:.13; }
        }
        @keyframes grid-pulse {
          0%,100% { opacity:.08; }
          50%      { opacity:.15; }
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}
      >
        {/* Particles */}
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />

        {/* Fog — bottom-center pool */}
        <div style={{
          position: "absolute", bottom: "22%", left: "8%", right: "8%", height: "38%",
          background: "radial-gradient(ellipse at 50% 100%, rgba(18,80,210,0.22) 0%, transparent 68%)",
          filter: "blur(48px)",
          animation: "fog-slow 9s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "12%", left: "22%", right: "22%", height: "28%",
          background: "radial-gradient(ellipse at 50% 100%, rgba(8,48,168,0.16) 0%, transparent 72%)",
          filter: "blur(72px)",
          animation: "fog-slow2 13s ease-in-out infinite",
        }} />

        {/* Light ray — left tower (≈11% from left, fires upward-right) */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, width: "52%", height: "65%",
          background: "linear-gradient(152deg, transparent 0%, rgba(24,110,255,0.09) 28%, transparent 55%)",
          transformOrigin: "11% 100%",
          animation: "ray-left 7s ease-in-out infinite",
        }} />

        {/* Light ray — right tower (≈89% from left, fires upward-left) */}
        <div style={{
          position: "absolute",
          top: 0, right: 0, width: "52%", height: "65%",
          background: "linear-gradient(208deg, transparent 0%, rgba(24,110,255,0.09) 28%, transparent 55%)",
          transformOrigin: "89% 100%",
          animation: "ray-right 8s ease-in-out infinite 1.5s",
        }} />

        {/* Grid projection — bottom floor */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "-10%", right: "-10%",
          height: "46%",
          backgroundImage:
            "linear-gradient(rgba(30,110,255,0.14) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(30,110,255,0.14) 1px, transparent 1px)",
          backgroundSize: "55px 55px",
          transform: "perspective(560px) rotateX(62deg)",
          transformOrigin: "50% 100%",
          maskImage: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)",
          animation: "grid-pulse 11s ease-in-out infinite",
        } as React.CSSProperties} />
      </div>
    </>
  );
}
