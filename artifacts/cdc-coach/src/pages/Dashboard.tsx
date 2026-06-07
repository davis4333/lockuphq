import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Lock, ShieldAlert, UtensilsCrossed, FileText, ClipboardList,
  MessageSquare, BookOpen, HelpCircle, AlertTriangle,
  LayoutDashboard, Users, Calendar, BarChart2, Mail, Settings,
  ChevronRight, Menu, Shield, Home, Phone, Clock, Wifi, User,
  BookMarked, Database, Cpu, FileWarning,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────
type Module = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "ready" | "dev";
  route?: string;
};

type NavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
};

// ─── Data ────────────────────────────────────────────────
const MODULES: Module[] = [
  { id: "lock-up-slip", title: "Lock-Up Slip", description: "Generate confinement placement narratives for incoming inmates.", icon: Lock, status: "ready", route: "/lock-up-slip" },
  { id: "strip-property", title: "Strip / Property Restriction", description: "Document property restriction placements.", icon: ShieldAlert, status: "ready", route: "/property-restriction" },
  { id: "meal-restriction", title: "Meal Restriction / Loaf", description: "Generate special management meal documentation.", icon: UtensilsCrossed, status: "dev" },
  { id: "incident-report", title: "Incident Report Narrative", description: "Draft IR narrative descriptions.", icon: FileText, status: "dev" },
  { id: "dr-description", title: "DR Description", description: "Complete the description portion of a disciplinary report.", icon: ClipboardList, status: "dev" },
  { id: "ask-cdc", title: "Ask CDC", description: "Quick reference for CDC policy and procedures.", icon: MessageSquare, status: "dev" },
  { id: "ask-fdc", title: "Ask FDC Policy", description: "Look up FDC policy guidance and references.", icon: BookOpen, status: "dev" },
  { id: "what-form", title: "What Form Do I Need?", description: "Find the correct form for any confinement situation.", icon: HelpCircle, status: "dev" },
];

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Users, label: "My Caseload" },
  { icon: BookMarked, label: "Coaching Plans" },
  { icon: Calendar, label: "Sessions" },
  { icon: BarChart2, label: "Reports" },
  { icon: BookOpen, label: "Resources" },
  { icon: Mail, label: "Messages" },
  { icon: Settings, label: "Settings" },
];

const QUICK_REF = [
  { icon: Users, label: "Count Status" },
  { icon: Home, label: "Housing Status" },
  { icon: Clock, label: "DR Time Limits" },
  { icon: ShieldAlert, label: "Property Restrictions" },
  { icon: Phone, label: "Emergency Contacts" },
];

const NEXT_UP = [
  { num: 1, title: "Lock-Up Slip", sub: "Most used today", route: "/lock-up-slip", active: true },
  { num: 2, title: "Strip / Property Restriction", sub: "Most used this week", route: "/property-restriction", active: true },
  { num: 3, title: "Incident Report Narrative", sub: "Prepare for next", active: false },
  { num: 4, title: "DR Description", sub: "Continue your workflow", active: false },
];

const SYS_STATUS = [
  { label: "Database", value: "Operational" },
  { label: "AI Models", value: "Operational" },
  { label: "Document Generation", value: "Operational" },
  { label: "Policy Reference", value: "Operational" },
  { label: "Training Sandbox", value: "Active" },
];

// ─── Sub-components ───────────────────────────────────────
function ReadinessGauge({ pct }: { pct: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 68, height: 68 }}>
      <svg width="68" height="68" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(37,99,235,0.18)" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke="#3b82f6" strokeWidth="5"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }} />
      </svg>
      <span className="absolute text-sm font-black text-blue-300">{pct}%</span>
    </div>
  );
}

function MiniBar({ heights }: { heights: number[] }) {
  return (
    <div className="flex items-end gap-px h-8">
      {heights.map((h, i) => (
        <div key={i} className="w-1.5 rounded-sm bg-blue-500/50" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────
export default function Dashboard() {
  const [, navigate] = useLocation();
  const [now, setNow] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const glass = "rounded-lg border border-blue-500/20 bg-[rgba(4,12,40,0.72)] backdrop-blur-md";
  const micro = "text-[9px] font-bold uppercase tracking-[0.18em]";

  return (
    <div className="flex h-screen overflow-hidden text-white select-none">

      {/* ── SIDEBAR ─────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={[
        "fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex flex-col w-[148px] shrink-0",
        "border-r border-blue-500/25 bg-[rgba(2,7,28,0.94)] backdrop-blur-xl transition-transform duration-200",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      ].join(" ")}>

        {/* FDOC branding */}
        <div className="px-3 pt-4 pb-3 border-b border-blue-500/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full border border-blue-400/60 bg-blue-950/80 flex items-center justify-center shrink-0"
              style={{ boxShadow: "0 0 10px rgba(59,130,246,0.3)" }}>
              <Shield className="h-4 w-4 text-blue-400" />
            </div>
            <div className="leading-[1.1]">
              <p className="text-[7.5px] font-black uppercase tracking-[0.12em] text-blue-200">Florida</p>
              <p className="text-[7.5px] font-black uppercase tracking-[0.12em] text-blue-200">Department of</p>
              <p className="text-[7.5px] font-black uppercase tracking-[0.12em] text-blue-200">Corrections</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              disabled={!active}
              className={[
                "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-[11px] font-semibold transition-all duration-150",
                active
                  ? "bg-blue-600/25 border border-blue-500/40 text-blue-100"
                  : "text-slate-500 disabled:cursor-default hover:text-slate-400",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* User card */}
        <div className="p-2 border-t border-blue-500/20">
          <div className="flex items-center gap-2 rounded-md bg-blue-900/25 border border-blue-500/20 px-2 py-1.5">
            <User className="h-5 w-5 text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-white truncate">CDC Officer</p>
              <p className="text-[8.5px] text-blue-400/60 truncate">Correctional Staff</p>
            </div>
            <ChevronRight className="h-3 w-3 text-blue-400/40 shrink-0" />
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top header */}
        <header className="shrink-0 flex items-center gap-3 px-3 py-2.5 border-b border-blue-500/20 bg-[rgba(2,8,28,0.88)] backdrop-blur-xl">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden text-blue-400 mr-0.5">
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm sm:text-lg font-black uppercase tracking-[0.1em] text-white leading-none"
              style={{ textShadow: "0 0 20px rgba(59,130,246,0.4)" }}>
              Confinement Command Center
            </h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[9px] text-blue-300/70 uppercase tracking-widest">OCI · Training Sandbox ·</span>
              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Online
              </span>
            </div>
          </div>

          {/* Clock */}
          <div className="hidden sm:block text-right shrink-0">
            <div className="text-lg font-black font-mono tracking-tight text-white leading-none"
              style={{ textShadow: "0 0 12px rgba(59,130,246,0.6)" }}>
              {timeStr}
            </div>
            <div className="text-[9px] text-blue-300/60 uppercase tracking-widest">{dateStr}</div>
          </div>

          {/* System status badge */}
          <div className="hidden md:flex shrink-0 items-center gap-2 rounded border border-emerald-500/40 bg-emerald-950/30 px-3 py-2"
            style={{ boxShadow: "0 0 10px rgba(16,185,129,0.1)" }}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <div className="leading-tight">
              <p className="text-[8px] font-bold uppercase tracking-widest text-emerald-400/70">System Status</p>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Operational</p>
            </div>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex min-h-full">

            {/* ── CENTER CONTENT ─── */}
            <div className="flex-1 min-w-0 p-3 space-y-3">

              {/* Mission */}
              <p className={`${micro} text-blue-400/60 pl-0.5`}>Mission: Equip. Empower. Excel.</p>

              {/* Stats row */}
              <div className={`${glass} flex items-center gap-5 px-5 py-3`}>
                <div className="flex flex-col items-center gap-1">
                  <ReadinessGauge pct={89} />
                  <p className={`${micro} text-blue-400/60`}>Readiness</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`${micro} text-blue-400/60 mb-2`}>Training Progress This Month</p>
                  <div className="w-full h-1.5 rounded-full bg-blue-900/60 overflow-hidden mb-2">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-700 to-blue-400"
                      style={{ width: "67%", boxShadow: "0 0 8px rgba(59,130,246,0.6)" }} />
                  </div>
                  <MiniBar heights={[40, 55, 35, 75, 50, 68, 42, 60, 72, 58, 80, 65]} />
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-950/35 backdrop-blur-md px-4 py-3"
                style={{ boxShadow: "0 0 15px rgba(245,158,11,0.08)" }}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <p className={`${micro} text-amber-400 mb-1`}>Training Sandbox Mode — Active</p>
                  <p className="text-[11px] text-amber-200/70 leading-relaxed">
                    Use <strong className="text-amber-300">fake information only.</strong> Do not enter real inmate names, DC numbers, medical information,
                    or any restricted work information. This tool is for training and practice purposes only.
                    No data is saved or transmitted.
                  </p>
                </div>
              </div>

              {/* Quick Reference */}
              <div>
                <p className={`${micro} text-blue-400/50 mb-2`}>— Quick Reference —</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {QUICK_REF.map(({ icon: Icon, label }) => (
                    <div key={label}
                      className={`${glass} flex flex-col items-center gap-1.5 py-3 px-2 text-center hover:border-blue-400/40 transition-colors cursor-default`}>
                      <Icon className="h-4 w-4 text-blue-400" />
                      <span className={`${micro} text-blue-300/70 leading-tight`}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Module grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                {MODULES.map((mod) => {
                  const Icon = mod.icon;
                  const ready = mod.status === "ready";
                  return (
                    <div key={mod.id}
                      className={[
                        glass, "flex flex-col gap-3 p-3.5",
                        ready
                          ? "border-blue-500/30 hover:border-blue-400/55 transition-colors"
                          : "opacity-65",
                      ].join(" ")}
                      style={ready ? { boxShadow: "0 0 18px rgba(37,99,235,0.08)" } : undefined}
                    >
                      {/* Icon + title row */}
                      <div className="flex items-start gap-2.5">
                        <div className={[
                          "w-9 h-9 rounded-md border flex items-center justify-center shrink-0",
                          ready
                            ? "border-blue-500/40 bg-blue-900/50 text-blue-400"
                            : "border-slate-600/30 bg-slate-800/30 text-slate-500",
                        ].join(" ")}
                          style={ready ? { boxShadow: "0 0 8px rgba(59,130,246,0.2)" } : undefined}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[11px] font-bold text-white leading-tight">{mod.title}</span>
                            {!ready && (
                              <span className="text-[7.5px] font-black uppercase tracking-wider text-amber-500/80 bg-amber-900/25 border border-amber-600/25 rounded px-1 py-px">
                                Soon
                              </span>
                            )}
                          </div>
                          <p className="text-[9.5px] text-slate-400/80 mt-0.5 leading-snug">{mod.description}</p>
                        </div>
                      </div>

                      {/* Status */}
                      <p className={`${micro} ${ready ? "text-emerald-400" : "text-amber-600/70"}`}>
                        Status: {ready ? "Ready" : "In Development"}
                      </p>

                      {/* CTA */}
                      {ready ? (
                        <button
                          onClick={() => navigate(mod.route!)}
                          className="w-full flex items-center justify-center gap-1.5 rounded border border-blue-500/50 bg-blue-700/20 text-blue-200 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-blue-600/35 hover:border-blue-400/70 transition-all"
                          style={{ boxShadow: "0 0 10px rgba(37,99,235,0.15)" }}>
                          Launch Module <ChevronRight className="h-3 w-3" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Lock className="h-3 w-3 text-slate-500" />
                          <span className={`${micro} text-slate-500`}>Coming Soon</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>

            {/* ── RIGHT PANEL ──────────────────────────────── */}
            <div className="hidden lg:flex flex-col gap-3 w-52 shrink-0 p-3 pl-0">

              {/* Next Up */}
              <div className={`${glass} p-3`}>
                <div className="flex items-center justify-between mb-3">
                  <p className={`${micro} text-blue-400/70`}>Next Up</p>
                  <span className="text-blue-400/30 text-base leading-none">≡</span>
                </div>
                <div className="space-y-1.5">
                  {NEXT_UP.map(({ num, title, sub, route, active }) => (
                    <button
                      key={num}
                      onClick={() => active && route && navigate(route)}
                      disabled={!active}
                      className={[
                        "w-full flex items-center gap-2 rounded border px-2 py-2 text-left transition-all duration-150",
                        active
                          ? "border-blue-500/30 bg-blue-900/30 hover:border-blue-400/50 hover:bg-blue-800/30 cursor-pointer"
                          : "border-blue-900/20 bg-transparent cursor-default opacity-50",
                      ].join(" ")}
                    >
                      <span className={[
                        "shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black border",
                        active
                          ? "border-blue-500/50 bg-blue-700/40 text-blue-300"
                          : "border-slate-700/40 bg-slate-900/40 text-slate-500",
                      ].join(" ")}>
                        {num}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold text-white uppercase tracking-wide truncate leading-tight">{title}</p>
                        <p className="text-[8.5px] text-blue-300/50 truncate">{sub}</p>
                      </div>
                      {active && <ChevronRight className="h-3 w-3 text-blue-400/40 shrink-0" />}
                    </button>
                  ))}
                </div>
                <button className="mt-3 w-full flex items-center justify-center gap-1 text-[8.5px] font-bold uppercase tracking-wider text-blue-400/50 hover:text-blue-300 transition-colors">
                  View All Workflows <ChevronRight className="h-2.5 w-2.5" />
                </button>
              </div>

              {/* System Status */}
              <div className={`${glass} p-3`}>
                <p className={`${micro} text-blue-400/70 mb-3`}>System Status</p>
                <div className="space-y-2">
                  {SYS_STATUS.map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                          style={{ boxShadow: "0 0 4px rgba(52,211,153,0.6)" }} />
                        <span className="text-[9px] uppercase tracking-wide text-slate-300 truncate">{label}</span>
                      </div>
                      <span className={`text-[9px] font-bold shrink-0 ${value === "Active" ? "text-blue-400" : "text-emerald-400"}`}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                <button className="mt-3 w-full flex items-center justify-center gap-1 text-[8.5px] font-bold uppercase tracking-wider text-blue-400/50 hover:text-blue-300 transition-colors">
                  View System Logs <ChevronRight className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom bar */}
        <footer className="shrink-0 flex items-center justify-center gap-3 px-4 py-2 border-t border-blue-500/15 bg-[rgba(2,7,25,0.82)] backdrop-blur-xl">
          <FileWarning className="h-3 w-3 text-blue-400/40" />
          <p className={`${micro} text-blue-400/40`}>
            Training Sandbox Mode &bull; For Practice Use Only &bull; No Real Data Stored
          </p>
        </footer>

      </div>
    </div>
  );
}
