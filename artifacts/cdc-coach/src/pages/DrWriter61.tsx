import { useLocation } from "wouter";
import { ArrowLeft, Lock } from "lucide-react";

// The DR Writer tab hosts the full adaptive LOCKUPHQ DR Writer app, which runs
// as its own service and is served through the shared proxy at "/dr-writer-app/".
// We embed it full-bleed so the officer gets the complete guided workflow.
const DR_WRITER_APP_URL = "/dr-writer-app/";

export default function DrWriter61() {
  const [, navigate] = useLocation();

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[rgb(2,6,18)] text-white">
      {/* Thin command bar — keeps the officer anchored to the desk coach */}
      <div className="z-10 flex shrink-0 items-center gap-3 border-b border-blue-400/25 bg-[rgba(4,11,34,0.9)] px-4 py-2.5 backdrop-blur-md">
        <button
          onClick={() => navigate("/")}
          className="group inline-flex items-center gap-2 rounded-md border border-blue-400/30 bg-[rgba(4,11,34,0.7)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200/80 backdrop-blur-sm transition-colors hover:border-blue-300/60 hover:text-blue-100"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to Command Center
        </button>
        <span className="h-5 w-[3px] rounded-full bg-blue-400" style={{ boxShadow: "0 0 8px rgba(59,130,246,0.9)" }} />
        <h1 className="text-sm font-black uppercase tracking-[0.14em] text-white" style={{ textShadow: "0 0 20px rgba(59,130,246,0.5)" }}>
          DR Writer
        </h1>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <Lock className="h-3 w-3 text-blue-300/70" />
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-200/70">
            Nothing saved • No real data stored
          </span>
        </div>
      </div>

      {/* The adaptive DR Writer app */}
      <iframe
        src={DR_WRITER_APP_URL}
        title="DR Writer"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
