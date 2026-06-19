import type { ReactNode, ComponentType } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Lock } from "lucide-react";
import fdocSeal from "@assets/ChatGPT_Image_Jun_7,_2026,_03_31_51_AM_1780817532915.png";

// ─── Shared HUD style tokens (match the Dashboard command-center theme) ───
export const hudPanel =
  "rounded-xl border border-blue-400/45 bg-[rgba(4,11,34,0.86)] backdrop-blur-lg";
export const hudInput =
  "w-full rounded-lg border border-blue-400/40 bg-[rgba(2,8,24,0.72)] px-3 py-2.5 text-sm text-blue-50 placeholder:text-blue-300/35 focus:outline-none focus:border-blue-300/70 focus:ring-2 focus:ring-blue-400/30 transition-colors";
export const hudLabel =
  "block text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200/65 mb-1.5";

type PageShellProps = {
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
  maxWidthClass?: string;
  children: ReactNode;
};

export default function PageShell({ title, subtitle, icon: Icon, maxWidthClass = "max-w-3xl", children }: PageShellProps) {
  const [, navigate] = useLocation();

  return (
    <div className="relative min-h-screen w-full text-white overflow-hidden">
      {/* ── Background atmosphere (matches the command center) ── */}
      {/* Lower scrim — keeps the working UI readable over the background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-[2] h-[62%]"
        style={{ background: "linear-gradient(to top, rgba(2,6,18,0.95) 0%, rgba(2,6,18,0.88) 30%, rgba(2,6,18,0.66) 55%, rgba(2,6,18,0.34) 76%, rgba(2,6,18,0.10) 90%, transparent 100%)" }} />
      {/* Soft top scrim — calms the FDOC hologram behind the header */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[2] h-[42%]"
        style={{ background: "linear-gradient(to bottom, rgba(2,6,18,0.66) 0%, rgba(2,6,18,0.30) 55%, transparent 100%)" }} />
      {/* Side scrims — soften the gutters (towers stay visible) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 left-0 z-[2] w-[20%] hidden xl:block"
        style={{ background: "linear-gradient(to right, rgba(2,6,18,0.40) 0%, transparent 100%)" }} />
      <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 right-0 z-[2] w-[20%] hidden xl:block"
        style={{ background: "linear-gradient(to left, rgba(2,6,18,0.40) 0%, transparent 100%)" }} />
      {/* Cinematic vignette */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[3]"
        style={{ background: "radial-gradient(ellipse at 50% 42%, transparent 56%, rgba(2,6,18,0.34) 90%, rgba(1,4,12,0.55) 100%)" }} />

      {/* ── Content ── */}
      <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 pt-6 pb-10">
        {/* Back to command center */}
        <button
          onClick={() => navigate("/")}
          className="group inline-flex items-center gap-2 rounded-md border border-blue-400/30 bg-[rgba(4,11,34,0.7)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200/80 backdrop-blur-sm transition-colors hover:border-blue-300/60 hover:text-blue-100"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to Command Center
        </button>

        {/* Identity + title */}
        <header className="mt-5 mb-6 flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-blue-400/70 bg-blue-950/70 flex items-center justify-center"
            style={{ boxShadow: "0 0 16px rgba(59,130,246,0.5), inset 0 0 12px rgba(59,130,246,0.28)" }}>
            <img src={fdocSeal} alt="Florida Department of Corrections seal" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-7 w-[3px] rounded-full bg-blue-400 shrink-0" style={{ boxShadow: "0 0 8px rgba(59,130,246,0.9)" }} />
              {Icon && (
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-blue-400/40 bg-blue-500/10 text-blue-300 shrink-0">
                  <Icon className="h-4 w-4" />
                </span>
              )}
              <h1 className="text-lg sm:text-2xl font-black uppercase tracking-[0.1em] text-white leading-none"
                style={{ textShadow: "0 0 24px rgba(59,130,246,0.5)" }}>
                {title}
              </h1>
            </div>
            {subtitle && (
              <p className="mt-2 text-[11px] sm:text-xs text-blue-300/65 leading-relaxed max-w-2xl">{subtitle}</p>
            )}
          </div>
        </header>

        {children}

        {/* Footer disclaimer (matches the command center) */}
        <footer className="mt-8 mx-auto flex w-fit items-center justify-center gap-2.5 rounded-md border border-blue-500/20 bg-[rgba(3,9,28,0.6)] backdrop-blur-sm py-2 px-5"
          style={{ boxShadow: "0 0 16px rgba(37,99,235,0.10)" }}>
          <Lock className="h-3 w-3 text-blue-300/70" />
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-200/75 text-center">
            Training Sandbox Mode • For Practice Use Only • No Real Data Stored
          </p>
        </footer>
      </div>
    </div>
  );
}
