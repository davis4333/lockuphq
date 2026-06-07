import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Lock, ShieldAlert, UtensilsCrossed, FileText, ClipboardList,
  MessageSquare, BookOpen, HelpCircle, AlertTriangle, ChevronRight,
  Shield,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────
type Module = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  route?: string;
};

// ─── Data ────────────────────────────────────────────────
const MODULES: Module[] = [
  { id: "lock-up-slip", title: "Lock-Up Slip", description: "Generate confinement placement narratives for incoming inmates.", icon: Lock, route: "/lock-up-slip" },
  { id: "strip-property", title: "Strip / Property Restriction", description: "Document property restriction placements.", icon: ShieldAlert, route: "/property-restriction" },
  { id: "meal-restriction", title: "Meal Restriction / Loaf", description: "Generate special management meal documentation.", icon: UtensilsCrossed },
  { id: "incident-report", title: "Incident Report Narrative", description: "Draft IR narrative descriptions.", icon: FileText },
  { id: "dr-description", title: "DR Description", description: "Complete the description portion of a disciplinary report.", icon: ClipboardList },
  { id: "ask-cdc", title: "Ask CDC", description: "Quick reference for CDC policy and procedures.", icon: MessageSquare },
  { id: "ask-fdc", title: "Ask FDC Policy", description: "Look up FDC policy guidance and references.", icon: BookOpen },
  { id: "what-form", title: "What Form Do I Need?", description: "Find the correct form for any confinement situation.", icon: HelpCircle },
];

const SYS_STATUS = [
  { label: "Document Engine", value: "Online" },
  { label: "Policy Engine", value: "Online" },
  { label: "Training Sandbox", value: "Active" },
  { label: "Database", value: "Operational" },
  { label: "AI Models", value: "Operational" },
  { label: "Security Protocol", value: "Enabled" },
];

// ─── Main Component ───────────────────────────────────────
export default function Dashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" });
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).toUpperCase();

  const glass = "rounded-lg border border-blue-500/25 bg-[rgba(4,12,40,0.62)] backdrop-blur-md";
  const micro = "text-[9px] font-bold uppercase tracking-[0.18em]";

  const handleLaunch = (mod: Module) => {
    if (mod.route) {
      navigate(mod.route);
    } else {
      toast({
        title: `${mod.title} — In Development`,
        description: "This module is coming soon. Use Lock-Up Slip or Strip / Property Restriction in the meantime.",
      });
    }
  };

  return (
    <div className="relative min-h-screen w-full text-white overflow-hidden">

      {/* Hologram glow — centered, pulsing behind content */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[38%] z-[1] hidden md:block"
        style={{
          width: "min(60vw, 720px)",
          height: "min(60vw, 720px)",
          background: "radial-gradient(circle, rgba(56,150,255,0.45) 0%, rgba(40,110,230,0.18) 35%, transparent 65%)",
          animation: "holo-pulse 6s ease-in-out infinite",
        }}
      />

      {/* Lower scrim — masks baked-in background text behind the working UI */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[2] h-[62%]"
        style={{
          background: "linear-gradient(to top, rgba(2,6,18,0.92) 0%, rgba(2,6,18,0.78) 40%, rgba(2,6,18,0.30) 80%, transparent 100%)",
        }}
      />
      {/* Right-edge scrim — masks 'ACTIVE MONITORING' etc. on the right */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 right-0 z-[2] w-[24%] hidden xl:block"
        style={{
          background: "linear-gradient(to left, rgba(2,6,18,0.55) 0%, transparent 100%)",
        }}
      />

      {/* ── CONTENT ───────────────────────────────────────── */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1480px] flex-col px-3 sm:px-5 py-3 sm:py-4">

        {/* ── TOP HEADER ──────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* FDOC identity */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-10 h-10 rounded-full border border-blue-400/50 bg-blue-950/70 flex items-center justify-center shrink-0"
              style={{ boxShadow: "0 0 14px rgba(59,130,246,0.35)" }}>
              <Shield className="h-5 w-5 text-blue-300" />
            </div>
            <div className="leading-[1.15]">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">Florida Department</p>
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">of Corrections</p>
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-blue-400/70 mt-0.5">Est. 1868</p>
            </div>
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0 lg:px-4 lg:border-l lg:border-blue-500/20">
            <h1 className="text-lg sm:text-2xl xl:text-[1.7rem] font-black uppercase tracking-[0.1em] text-white leading-none"
              style={{ textShadow: "0 0 22px rgba(59,130,246,0.45)" }}>
              Confinement Command Center
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] text-blue-300/70 uppercase tracking-[0.2em]">OCI • Training Sandbox •</span>
              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"
                  style={{ boxShadow: "0 0 6px rgba(52,211,153,0.9)" }} />
                Online
              </span>
            </div>
          </div>

          {/* Clock + status */}
          <div className="flex items-stretch gap-2.5 shrink-0">
            <div className={`${glass} flex flex-col justify-center px-4 py-2 text-right`}>
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white leading-none"
                  style={{ textShadow: "0 0 14px rgba(59,130,246,0.6)" }}>
                  {timeStr}
                </span>
                <span className="text-[9px] font-bold text-blue-400/70">EST</span>
              </div>
              <div className="text-[9px] text-blue-300/60 uppercase tracking-[0.2em] mt-0.5">{dateStr}</div>
            </div>

            <div className={`${glass} flex items-center gap-2.5 px-4 py-2 border-emerald-500/35`}
              style={{ boxShadow: "0 0 14px rgba(16,185,129,0.12)" }}>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"
                style={{ boxShadow: "0 0 8px rgba(52,211,153,0.9)" }} />
              <div className="leading-tight">
                <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">System Status</p>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-400">Operational</p>
              </div>
            </div>
          </div>
        </header>

        {/* ── WARNING BANNER (constrained width) ──────────── */}
        <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-500/45 bg-amber-950/40 backdrop-blur-md px-4 py-3 w-full max-w-[720px]"
          style={{ boxShadow: "0 0 18px rgba(245,158,11,0.10)" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className={`${micro} text-amber-400 mb-1`}>Training Sandbox Mode — Active</p>
            <p className="text-[11px] text-amber-200/75 leading-relaxed">
              Use <strong className="text-amber-300">fake information only.</strong> Do not enter real inmate names, DC numbers,
              medical information, or any restricted work information. This tool is for training and practice purposes only.
              No data is saved or transmitted.
            </p>
          </div>
        </div>

        {/* ── SPACER — keeps the FDOC hologram visible ─────── */}
        <div className="flex-1 min-h-[80px]" />

        {/* ── LOWER SECTION: modules + right panels ───────── */}
        <div className="flex flex-col xl:flex-row gap-4 items-start">

          {/* Module grid */}
          <div className="flex-1 min-w-0 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {MODULES.map((mod) => {
                const Icon = mod.icon;
                return (
                  <div
                    key={mod.id}
                    className="group relative flex flex-col gap-2.5 rounded-lg border border-blue-500/25 bg-[rgba(4,12,40,0.62)] backdrop-blur-md p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400/70 hover:bg-[rgba(8,20,55,0.72)]"
                    style={{ boxShadow: "0 0 16px rgba(37,99,235,0.08)" }}
                  >
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-md border border-blue-500/40 bg-blue-900/40 flex items-center justify-center transition-all group-hover:border-blue-400/70"
                      style={{ boxShadow: "0 0 10px rgba(59,130,246,0.2)" }}>
                      <Icon className="h-5 w-5 text-blue-300" />
                    </div>

                    {/* Title + description */}
                    <div className="flex-1">
                      <h3 className="text-[11.5px] font-black uppercase tracking-[0.06em] text-white leading-tight">{mod.title}</h3>
                      <p className="text-[9.5px] text-slate-400/85 mt-1 leading-snug">{mod.description}</p>
                    </div>

                    {/* Launch button */}
                    <button
                      onClick={() => handleLaunch(mod)}
                      aria-label={`Launch ${mod.title} module`}
                      className="mt-auto w-full flex items-center justify-center gap-1.5 rounded border border-blue-500/50 bg-blue-700/20 text-blue-200 py-2 text-[9.5px] font-black uppercase tracking-[0.18em] transition-all group-hover:bg-blue-600/40 group-hover:border-blue-400/80 group-hover:text-white"
                      style={{ boxShadow: "0 0 10px rgba(37,99,235,0.15)" }}
                    >
                      Launch Module <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panels */}
          <div className="flex flex-col gap-3 w-full xl:w-60 shrink-0">
            {/* System Status */}
            <div className={`${glass} p-4`}>
              <p className={`${micro} text-blue-300/80 mb-3 pb-2 border-b border-blue-500/15`}>System Status</p>
              <div className="space-y-2.5">
                {SYS_STATUS.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-slate-300/90 truncate">{label}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[9.5px] font-black uppercase tracking-wider ${value === "Active" || value === "Enabled" ? "text-blue-400" : "text-emerald-400"}`}>
                        {value}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full ${value === "Active" || value === "Enabled" ? "bg-blue-400" : "bg-emerald-400"}`}
                        style={{ boxShadow: "0 0 5px currentColor" }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* System Information */}
            <div className={`${glass} p-4`}>
              <p className={`${micro} text-blue-300/80 mb-3 pb-2 border-b border-blue-500/15`}>System Information</p>
              <div className="space-y-2.5">
                <InfoRow label="Clearance Level" value="Confinement Ops" />
                <InfoRow label="Environment" value="Training" />
                <InfoRow label="Version" value="2.0.0" />
                <InfoRow label="Last System Check" value={`${timeStr} EST`} mono />
              </div>
            </div>
          </div>
        </div>

        {/* ── BOTTOM DISCLAIMER ───────────────────────────── */}
        <footer className="flex items-center justify-center gap-2.5 pt-4 pb-1">
          <Lock className="h-3 w-3 text-blue-400/45" />
          <p className={`${micro} text-blue-400/50 text-center`}>
            Training Sandbox Mode • For Practice Use Only • No Real Data Stored
          </p>
        </footer>

      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-[0.1em] text-slate-400/80 truncate">{label}</span>
      <span className={`text-[9.5px] font-bold uppercase tracking-wider text-blue-200 shrink-0 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
