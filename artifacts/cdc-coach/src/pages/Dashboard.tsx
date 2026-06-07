import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Lock, ShieldAlert, UtensilsCrossed, FileText, ClipboardList,
  MessageSquare, BookOpen, HelpCircle, AlertTriangle, ChevronRight,
} from "lucide-react";
import fdocSeal from "@assets/ChatGPT_Image_Jun_7,_2026,_03_31_51_AM_1780817532915.png";

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
  { label: "Database", value: "Operational" },
  { label: "AI Models", value: "Operational" },
  { label: "Security Protocol", value: "Enabled" },
];

const CLASSIFICATION = "RESTRICTED ACCESS // COMPARTMENTALIZED TRAINING SYSTEM // DO NOT REPRODUCE";
const TICKER = "// AUDIT MODE ACTIVE — SESSION TRACE ENABLED — MODULE ACCESS MONITORED — CLEARANCE VERIFIED — SECURE SANDBOX ONLINE — DO NOT TERMINATE CONNECTION ";

// Florida wireframe map location baked into the background image (bg-fdoc-command-v2.png).
// Used to compute the on-screen overlay rect that tracks the `cover` background.
const FL_IMG_W = 1672;
const FL_IMG_H = 941;
const FL_BG_POS_Y = 30; // matches `background-position: center 30px` in index.css
const FL_FRAC = { x0: 0.712, x1: 0.864, y0: 0.087, y1: 0.255 }; // Florida bbox as image fractions

// Monitored facility nodes — positioned (% within the Florida map overlay box)
// to approximate FDOC facility distribution; d = delay, t = duration (organic variation)
const FL_NODES = [
  { x: 5,  y: 13, d: 0.0, t: 6.6 },  // far western panhandle (Pensacola)
  { x: 22, y: 13, d: 2.1, t: 7.4 },  // central panhandle
  { x: 42, y: 16, d: 3.4, t: 6.0 },  // Tallahassee
  { x: 55, y: 24, d: 1.2, t: 7.0 },  // Big Bend
  { x: 73, y: 11, d: 4.0, t: 6.8 },  // Jacksonville (NE)
  { x: 62, y: 32, d: 0.6, t: 7.8 },  // Gainesville / Ocala
  { x: 75, y: 40, d: 2.7, t: 6.2 },  // Daytona (east coast)
  { x: 64, y: 46, d: 1.6, t: 7.2 },  // Orlando (central)
  { x: 58, y: 52, d: 3.8, t: 6.6 },  // Tampa (west coast)
  { x: 71, y: 58, d: 1.0, t: 7.6 },  // Sebring (central spine)
  { x: 76, y: 66, d: 2.3, t: 6.4 },  // West Palm (SE)
  { x: 64, y: 70, d: 4.4, t: 7.0 },  // Ft. Myers (SW)
  { x: 74, y: 86, d: 0.3, t: 6.9 },  // Homestead / southern tip
];

const PHONETIC = ["ALPHA", "BRAVO", "DELTA", "ECHO", "FOXTROT", "SIERRA", "TANGO", "OMEGA", "VECTOR", "ZULU"];
function genSessionId() {
  const hex = () => Math.floor(Math.random() * 16).toString(16).toUpperCase();
  const word = PHONETIC[Math.floor(Math.random() * PHONETIC.length)];
  const num = String(Math.floor(1000 + Math.random() * 9000));
  return `${hex()}${hex()}${hex()}-${word}-${num}`;
}

function fmtElapsed(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(t / 3600)).padStart(2, "0");
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ─── Main Component ───────────────────────────────────────
export default function Dashboard() {
  const [, navigate] = useLocation();
  const [now, setNow] = useState(new Date());
  const [sessionId] = useState(genSessionId);
  const startRef = useRef(Date.now());
  const [denied, setDenied] = useState<{ id: string; n: number } | null>(null);
  const denyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flRect, setFlRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Track the Florida wireframe map baked into the fixed `cover` background image,
  // so the facility-node overlay stays glued to it across any viewport aspect ratio.
  useEffect(() => {
    const computeFlRect = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      // background-image: cover, background-position: center 30px (matches index.css)
      const s = Math.max(W / FL_IMG_W, H / FL_IMG_H);
      const renderW = FL_IMG_W * s;
      const renderH = FL_IMG_H * s;
      const offsetX = (W - renderW) / 2; // horizontal "center"
      const offsetY = FL_BG_POS_Y; // vertical "30px" from top
      setFlRect({
        left: offsetX + FL_FRAC.x0 * renderW,
        top: offsetY + FL_FRAC.y0 * renderH,
        width: (FL_FRAC.x1 - FL_FRAC.x0) * renderW,
        height: (FL_FRAC.y1 - FL_FRAC.y0) * renderH,
      });
    };
    computeFlRect();
    window.addEventListener("resize", computeFlRect);
    return () => window.removeEventListener("resize", computeFlRect);
  }, []);

  useEffect(() => () => { if (denyTimer.current) clearTimeout(denyTimer.current); }, []);

  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" });
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).toUpperCase();
  const sessionDuration = fmtElapsed(now.getTime() - startRef.current);

  const panel = "rounded-lg border border-blue-400/45 bg-[rgba(4,11,34,0.84)] backdrop-blur-lg";
  const micro = "text-[9px] font-bold uppercase tracking-[0.18em]";
  const ambHead = "text-[8.5px] font-bold uppercase tracking-[0.22em] text-blue-200/55";
  const ambLine = "text-[8.5px] uppercase tracking-[0.16em] text-blue-300/35 font-mono";

  const handleLaunch = (mod: Module) => {
    if (mod.route) {
      navigate(mod.route);
      return;
    }
    // Locked module: red border flash + temporary "ACCESS DENIED" message
    setDenied((prev) => ({ id: mod.id, n: (prev?.id === mod.id ? prev.n : 0) + 1 }));
    if (denyTimer.current) clearTimeout(denyTimer.current);
    denyTimer.current = setTimeout(() => setDenied(null), 1800);
  };

  return (
    <div className="relative min-h-screen w-full text-white overflow-hidden">

      {/* Glow comes from the background image itself — no page-added bloom/aura layers. */}

      {/* Lower scrim — keeps the working UI readable over the background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[2] h-[62%]"
        style={{
          background: "linear-gradient(to top, rgba(2,6,18,0.95) 0%, rgba(2,6,18,0.88) 30%, rgba(2,6,18,0.66) 55%, rgba(2,6,18,0.34) 76%, rgba(2,6,18,0.10) 90%, transparent 100%)",
        }}
      />
      {/* Top corner scrims — soften the side gutters (towers stay visible) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 left-0 z-[2] w-[20%] hidden xl:block"
        style={{ background: "linear-gradient(to right, rgba(2,6,18,0.40) 0%, transparent 100%)" }} />
      <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 right-0 z-[2] w-[20%] hidden xl:block"
        style={{ background: "linear-gradient(to left, rgba(2,6,18,0.40) 0%, transparent 100%)" }} />
      {/* Cinematic vignette — soft dark frame around screen edges */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[3]"
        style={{ background: "radial-gradient(ellipse at 50% 42%, transparent 56%, rgba(2,6,18,0.34) 90%, rgba(1,4,12,0.55) 100%)" }} />

      {/* Slow red heartbeat behind the FDOC hologram */}
      <div aria-hidden="true" className="cdc-heartbeat pointer-events-none fixed left-1/2 top-[26%] z-[3] h-[460px] w-[460px]"
        style={{ background: "radial-gradient(circle, rgba(220,38,38,0.55) 0%, rgba(190,28,28,0.18) 38%, transparent 68%)", mixBlendMode: "screen" }} />

      {/* Statewide facility monitoring overlay on the Florida wireframe map */}
      <div aria-hidden="true" className="pointer-events-none fixed z-[2]"
        style={{ left: flRect.left, top: flRect.top, width: flRect.width, height: flRect.height }}>
        {/* Faint dark-red ambient heartbeat behind the state */}
        <div className="cdc-fl-heartbeat absolute"
          style={{ left: "52%", top: "50%", width: "160%", height: "150%", borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(220,38,38,0.55) 0%, rgba(185,28,28,0.18) 42%, transparent 70%)", mixBlendMode: "screen" }} />
        {/* Live monitored facility nodes */}
        {FL_NODES.map((n, i) => (
          <span key={i} className="absolute" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
            <span className="cdc-node-ring absolute h-[6px] w-[6px] -ml-[3px] -mt-[3px] rounded-full border border-red-500/70"
              style={{ animationDelay: `${n.d}s`, animationDuration: `${n.t}s` }} />
            <span className="cdc-node-dot absolute h-[5px] w-[5px] -ml-[2.5px] -mt-[2.5px] rounded-full bg-red-400"
              style={{ animationDelay: `${n.d}s`, animationDuration: `${n.t}s`, boxShadow: "0 0 5px 1px rgba(239,68,68,0.9), 0 0 11px 2px rgba(220,38,38,0.55)" }} />
          </span>
        ))}
      </div>

      {/* ── TOP / BOTTOM CLASSIFICATION BARS ──────────────── */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[50] flex items-center justify-center border-b border-red-500/30 bg-[rgba(28,4,4,0.78)] py-[3px] backdrop-blur-sm"
        style={{ boxShadow: "0 0 14px rgba(220,38,38,0.30)" }}>
        <span className="text-[8px] font-bold uppercase tracking-[0.34em] text-red-300/80">{CLASSIFICATION}</span>
      </div>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-[50] flex items-center justify-center border-t border-red-500/30 bg-[rgba(28,4,4,0.78)] py-[3px] backdrop-blur-sm"
        style={{ boxShadow: "0 0 14px rgba(220,38,38,0.30)" }}>
        <span className="text-[8px] font-bold uppercase tracking-[0.34em] text-red-300/80">{CLASSIFICATION}</span>
      </div>

      {/* ── CONTENT ───────────────────────────────────────── */}
      <div className="relative z-10 mx-auto flex h-[100dvh] max-w-[1500px] flex-col overflow-y-auto px-4 sm:px-8 pt-6 pb-6">

        {/* ── AMBIENT CLASSIFIED MICRO-PANELS (decorative HUD readouts) ── */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden xl:block">
          {/* Left — system integrity */}
          <div className="absolute left-2 top-[30%] space-y-[3px]">
            <p className={ambHead}>System Integrity</p>
            <p className={`${ambLine} text-emerald-300/45`}>Secure</p>
            <p className={`${ambLine} mt-1.5`}>Encryption: Active</p>
            <p className={ambLine}>Connection: Secure</p>
          </div>
          {/* Left — protocol node */}
          <div className="absolute left-[14%] top-[30%] space-y-[3px]">
            <p className={ambHead}>Protocol 61.08</p>
            <p className={ambLine}>Data Link: Secure</p>
            <p className={ambLine}>Node: FDC-OCI-01</p>
            <p className={`${ambLine} text-emerald-300/45`}>Status: Online</p>
          </div>
          {/* Left — threat level (kept clear of the Florida map) */}
          <div className="absolute left-2 top-[46%] space-y-[3px]">
            <p className={ambLine}>Threat Level: <span className="text-emerald-300/55">Minimal</span></p>
            <p className={`${ambLine} text-emerald-300/45`}>Status: Secure</p>
          </div>
          {/* Right — coordinates */}
          <div className="absolute right-2 top-[24%] space-y-[3px] text-right">
            <p className={ambHead}>Coordinates</p>
            <p className={`${ambLine} text-blue-200/45`}>27.6648° N</p>
            <p className={`${ambLine} text-blue-200/45`}>81.5158° W</p>
          </div>
          {/* Right — protocol sync */}
          <div className="absolute right-2 top-[36%] space-y-[3px] text-right">
            <p className={ambHead}>Protocol 61.08</p>
            <p className={ambLine}>Data Sync: Active</p>
            <p className={`${ambLine} text-emerald-300/45`}>AI Models: Online</p>
            <p className={`${ambLine} text-emerald-300/45`}>System: Operational</p>
          </div>
        </div>

        {/* ── TOP HEADER ──────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* FDOC identity */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative w-10 h-10 rounded-full border border-blue-400/70 bg-blue-950/70 overflow-hidden flex items-center justify-center shrink-0"
              style={{ boxShadow: "0 0 16px rgba(59,130,246,0.5), inset 0 0 12px rgba(59,130,246,0.28)" }}>
              <img src={fdocSeal} alt="Florida Department of Corrections seal" className="h-full w-full object-cover" />
            </div>
            <div className="leading-[1.15]">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">Florida Department</p>
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">of Corrections</p>
              <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-blue-400/70 mt-0.5">Est. 1868</p>
            </div>
          </div>

          {/* Title with HUD accents */}
          <div className="flex-1 min-w-0 lg:px-5 lg:border-l lg:border-blue-500/25">
            <div className="flex items-center gap-2">
              <span className="hidden lg:block h-7 w-[3px] rounded-full bg-blue-400" style={{ boxShadow: "0 0 8px rgba(59,130,246,0.9)" }} />
              <h1 className="text-lg sm:text-2xl xl:text-[1.7rem] font-black uppercase tracking-[0.12em] text-white leading-none"
                style={{ textShadow: "0 0 24px rgba(59,130,246,0.5)" }}>
                Confinement Command Center
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap pl-0 lg:pl-[11px]">
              <span className="text-[10px] text-blue-300/70 uppercase tracking-[0.2em]">OCI • Training Sandbox •</span>
              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"
                  style={{ boxShadow: "0 0 8px rgba(52,211,153,1)" }} />
                Online
              </span>
              <span className="hidden sm:block flex-1 h-px bg-gradient-to-r from-blue-500/40 to-transparent ml-2" />
            </div>
          </div>

          {/* Clock + status */}
          <div className="flex items-stretch gap-2.5 shrink-0">
            <div className={`${panel} flex flex-col justify-center px-4 py-2 text-right`}>
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white leading-none"
                  style={{ textShadow: "0 0 14px rgba(59,130,246,0.6)" }}>
                  {timeStr}
                </span>
                <span className="text-[9px] font-bold text-blue-400/70">EST</span>
              </div>
              <div className="text-[9px] text-blue-300/60 uppercase tracking-[0.2em] mt-0.5">{dateStr}</div>
            </div>

            <div className={`${panel} flex items-center gap-2.5 px-4 py-2 border-emerald-500/40`}
              style={{ boxShadow: "0 0 16px rgba(16,185,129,0.18)" }}>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"
                style={{ boxShadow: "0 0 10px rgba(52,211,153,1)" }} />
              <div className="leading-tight">
                <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">System Status</p>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300" style={{ textShadow: "0 0 9px rgba(52,211,153,0.65)" }}>Operational</p>
              </div>
            </div>
          </div>
        </header>

        {/* ── WARNING BANNER + SESSION TELEMETRY ──────────── */}
        <div className="mt-3.5 flex flex-col lg:flex-row items-stretch gap-3">
          {/* Warning banner */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-400/70 bg-[rgba(28,18,2,0.72)] backdrop-blur-md px-4 py-3 w-full max-w-full lg:max-w-[520px]"
            style={{ boxShadow: "0 0 26px rgba(245,158,11,0.22)" }}>
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-amber-400/60 bg-amber-500/15"
              style={{ boxShadow: "0 0 10px rgba(245,158,11,0.3)" }}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
            </div>
            <div>
              <p className={`${micro} text-amber-400 mb-1`}>Restricted Training System — Audit Mode Active</p>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Authorized training use only. Do not enter real inmate names, DC numbers, medical information,
                or restricted work information. Simulated session activity may be displayed for training atmosphere.
                No operational data is stored.
              </p>
              <p className="mt-1.5 text-[8px] font-mono uppercase tracking-[0.16em] text-amber-300/55">
                Session Trace: Active // Operator: [Redacted] // System Mode: Secure Sandbox
              </p>
            </div>
          </div>

          {/* Session telemetry HUD */}
          <div className={`${panel} border-blue-400/35 flex flex-col justify-center gap-1.5 px-4 py-3 w-full lg:w-[230px] shrink-0`}
            style={{ boxShadow: "0 0 18px rgba(37,99,235,0.16)" }}>
            <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-blue-300/55 mb-0.5 pb-1 border-b border-blue-500/20">Session Telemetry</p>
            <TeleRow label="Session ID" value={sessionId} accent="blue" />
            <TeleRow label="Terminal Origin" value="27.3°N 80.3°W" accent="dim" />
            <TeleRow label="Operator" value="[REDACTED]" accent="amber" />
            <TeleRow label="Duration" value={sessionDuration} accent="emerald" />
          </div>
        </div>

        {/* ── DEDICATED HOLOGRAM DISPLAY ZONE (flexible — absorbs all extra height) ── */}
        <div aria-hidden="true" className="flex-1 min-h-[104px]" />

        {/* ── LOWER CONSOLE: modules + right panels ───────── */}
        <div className="mx-auto w-full max-w-[1340px] flex flex-col xl:flex-row gap-5 items-start">

          {/* Left breathing room — shifts the console right under the hologram */}
          <div aria-hidden="true" className="hidden xl:block shrink-0" style={{ width: "5%" }} />

          {/* Module grid */}
          <div className="flex-1 min-w-0 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {MODULES.map((mod) => {
                const Icon = mod.icon;
                const granted = !!mod.route;
                return (
                  <div
                    key={mod.id}
                    className="group relative overflow-hidden flex flex-col gap-2 rounded-lg border border-blue-400/50 bg-[rgba(4,11,34,0.80)] backdrop-blur-lg p-3 min-h-[152px] transition-all duration-200 hover:-translate-y-1 hover:border-blue-300/90 hover:bg-[rgba(8,20,56,0.85)]"
                    style={{ boxShadow: "0 0 20px rgba(37,99,235,0.20), inset 0 0 24px rgba(37,99,235,0.08)" }}
                  >
                    {/* Inner glass shine */}
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-blue-200/10 to-transparent" />

                    {/* Locked module: brief red flash once on load */}
                    {!granted && (
                      <div aria-hidden="true" className="cdc-deny-ring-load pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-red-500"
                        style={{ boxShadow: "0 0 18px rgba(239,68,68,0.55), inset 0 0 18px rgba(239,68,68,0.25)" }} />
                    )}

                    {/* Denied-click red flash + temporary message */}
                    {!granted && denied?.id === mod.id && (
                      <div key={denied.n} className="pointer-events-none absolute inset-0 z-30">
                        <div aria-hidden="true" className="cdc-deny-ring absolute inset-0 rounded-lg border-2 border-red-500"
                          style={{ boxShadow: "0 0 20px rgba(239,68,68,0.6), inset 0 0 20px rgba(239,68,68,0.28)" }} />
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
                          <span className="rounded border border-red-400/70 bg-[rgba(40,4,4,0.9)] px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-red-300"
                            style={{ boxShadow: "0 0 14px rgba(239,68,68,0.5)" }}>
                            Access Denied // Module Locked
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Hover tooltip for locked modules */}
                    {!granted && (
                      <div className="pointer-events-none absolute left-1/2 top-1.5 z-30 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <span className="whitespace-nowrap rounded border border-red-400/55 bg-[rgba(36,6,6,0.92)] px-1.5 py-[3px] text-[7px] font-bold uppercase tracking-[0.12em] text-red-300/90"
                          style={{ boxShadow: "0 0 12px rgba(239,68,68,0.35)" }}>
                          Clearance Insufficient — Attempt Recorded
                        </span>
                      </div>
                    )}

                    {/* Classified access badge */}
                    {granted ? (
                      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-[3px] border border-emerald-400/45 bg-emerald-950/55 px-1.5 py-[3px] backdrop-blur-sm"
                        style={{ boxShadow: "0 0 10px rgba(16,185,129,0.28)" }}>
                        <span className="h-[5px] w-[5px] rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px rgba(16,185,129,0.95)" }} />
                        <span className="text-[7px] font-black uppercase tracking-[0.14em] text-emerald-300">Access Granted</span>
                      </div>
                    ) : (
                      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-[3px] border border-amber-400/45 bg-[rgba(40,16,4,0.62)] px-1.5 py-[3px] backdrop-blur-sm"
                        style={{ boxShadow: "0 0 10px rgba(245,158,11,0.22)" }}>
                        <span className="h-[5px] w-[5px] rounded-full bg-amber-400" style={{ boxShadow: "0 0 6px rgba(245,158,11,0.95)" }} />
                        <span className="text-[7px] font-black uppercase tracking-[0.14em] text-amber-300">Access Denied</span>
                      </div>
                    )}

                    {/* Icon */}
                    <div className="relative w-10 h-10 rounded-md border border-blue-400/60 bg-blue-900/50 flex items-center justify-center transition-all group-hover:border-blue-300/90"
                      style={{ boxShadow: "0 0 16px rgba(59,130,246,0.40), inset 0 0 14px rgba(59,130,246,0.20)" }}>
                      <Icon className="h-[18px] w-[18px] text-blue-100" />
                    </div>

                    {/* Title + description */}
                    <div className="relative flex-1">
                      <h3 className="text-[11.5px] font-black uppercase tracking-[0.06em] text-white leading-tight">{mod.title}</h3>
                      <p className="text-[9px] text-slate-300/75 mt-1 leading-snug">{mod.description}</p>
                    </div>

                    {/* Launch button */}
                    {granted ? (
                      <button
                        onClick={() => handleLaunch(mod)}
                        aria-label={`Launch ${mod.title} module`}
                        className="relative mt-auto w-full flex items-center justify-center gap-1.5 rounded border border-blue-400/65 bg-blue-700/30 text-blue-100 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition-all group-hover:bg-blue-600/55 group-hover:border-blue-300/95 group-hover:text-white"
                        style={{ boxShadow: "0 0 16px rgba(37,99,235,0.28)" }}
                      >
                        Launch Module <ChevronRight className="h-3 w-3" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleLaunch(mod)}
                        aria-label={`${mod.title} module locked`}
                        className="relative mt-auto w-full flex items-center justify-center gap-1.5 rounded border border-amber-400/35 bg-amber-950/25 text-amber-200/75 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] cursor-not-allowed transition-all hover:bg-amber-900/35 hover:border-amber-300/55"
                        style={{ boxShadow: "0 0 12px rgba(245,158,11,0.14)" }}
                      >
                        <Lock className="h-3 w-3" /> Launch Module
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panels */}
          <div className="flex flex-col gap-3 w-full xl:w-[248px] shrink-0">
            {/* System Status */}
            <div className={`relative overflow-hidden ${panel} p-3`} style={{ boxShadow: "0 0 24px rgba(37,99,235,0.22), inset 0 0 24px rgba(37,99,235,0.07)" }}>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-blue-200/8 to-transparent" />
              <p className={`relative ${micro} text-blue-200 mb-2 pb-1.5 border-b border-blue-500/25`}>System Status</p>
              <div className="relative space-y-2">
                {SYS_STATUS.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-slate-200 truncate">{label}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[9.5px] font-black uppercase tracking-wider ${value === "Active" || value === "Enabled" ? "text-blue-200" : "text-emerald-300"}`}
                        style={{ textShadow: value === "Active" || value === "Enabled" ? "0 0 9px rgba(147,197,253,0.6)" : "0 0 9px rgba(52,211,153,0.65)" }}>
                        {value}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${value === "Active" || value === "Enabled" ? "bg-blue-300" : "bg-emerald-400"}`}
                        style={{ boxShadow: "0 0 10px currentColor" }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* System Information */}
            <div className={`relative overflow-hidden ${panel} p-3`} style={{ boxShadow: "0 0 24px rgba(37,99,235,0.22), inset 0 0 24px rgba(37,99,235,0.07)" }}>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-blue-200/8 to-transparent" />
              <p className={`relative ${micro} text-blue-200 mb-2 pb-1.5 border-b border-blue-500/25`}>System Information</p>
              <div className="relative space-y-2">
                <InfoRow label="Clearance Level" value="Blacksite Authorized" />
                <InfoRow label="Environment" value="Secure Sandbox" />
                <InfoRow label="Encryption" value="AES-256 Active" />
                <InfoRow label="Session Trace" value="Armed" />
                <InfoRow label="Build" value="Classified" />
                <InfoRow label="Last System Check" value={`${timeStr} EST`} mono />
              </div>
            </div>
          </div>
        </div>

        {/* ── LIVE ACTIVITY TICKER ────────────────────────── */}
        <div className="mt-3 overflow-hidden rounded-md border border-blue-500/20 bg-[rgba(3,9,28,0.55)] backdrop-blur-sm py-1.5"
          style={{ boxShadow: "0 0 14px rgba(37,99,235,0.10)" }}>
          <div className="cdc-ticker flex w-max whitespace-nowrap">
            <span className="text-[8.5px] font-mono uppercase tracking-[0.22em] text-emerald-300/45 px-2">{TICKER.repeat(2)}</span>
            <span className="text-[8.5px] font-mono uppercase tracking-[0.22em] text-emerald-300/45 px-2" aria-hidden="true">{TICKER.repeat(2)}</span>
          </div>
        </div>

        {/* ── BOTTOM DISCLAIMER ───────────────────────────── */}
        <footer className="mt-3 flex items-center justify-center gap-2.5 rounded-md border border-blue-500/20 bg-[rgba(3,9,28,0.6)] backdrop-blur-sm py-2 px-5 mx-auto"
          style={{ boxShadow: "0 0 16px rgba(37,99,235,0.10)" }}>
          <Lock className="h-3 w-3 text-blue-300/70" />
          <p className={`${micro} text-blue-200/75 text-center`}>
            Training Sandbox Mode • For Practice Use Only • No Real Data Stored
          </p>
        </footer>

      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5">
      <span className="text-[9px] uppercase tracking-[0.05em] text-slate-300/80 whitespace-nowrap shrink-0">{label}</span>
      <span className={`text-[10px] font-bold uppercase tracking-tight text-blue-200 text-right whitespace-nowrap ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function TeleRow({ label, value, accent }: { label: string; value: string; accent: "blue" | "emerald" | "amber" | "dim" }) {
  const tone =
    accent === "emerald" ? "text-emerald-300/85"
      : accent === "amber" ? "text-amber-300/80"
        : accent === "dim" ? "text-blue-300/55"
          : "text-blue-200/85";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[7.5px] font-bold uppercase tracking-[0.14em] text-blue-300/45 whitespace-nowrap shrink-0">{label}</span>
      <span className={`text-[9px] font-mono font-bold tracking-tight text-right whitespace-nowrap ${tone}`}>{value}</span>
    </div>
  );
}
