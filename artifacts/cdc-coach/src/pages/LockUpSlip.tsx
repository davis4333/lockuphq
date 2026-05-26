import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Copy, CheckCheck, AlertTriangle, FileText } from "lucide-react";

const CHARGES = [
  "Protection Evaluation",
  "Disorderly Conduct",
  "Disobeying a Verbal Order",
  "Fighting",
  "Assault on Staff",
  "Assault on Inmate",
  "Possession of Contraband",
  "Possession of a Weapon",
  "Threatening Staff",
  "Threatening an Inmate",
  "Introduction of Contraband",
  "Escape / Attempted Escape",
  "Destruction of State Property",
  "Battery on Staff",
  "Battery on Inmate",
  "Sexual Misconduct",
  "Unauthorized Location",
  "Failure to Submit to Urinalysis",
  "Inciting a Disturbance",
  "Other / Specify",
];

const CONFINEMENT_TYPES = [
  "Administrative Confinement (AC)",
  "Disciplinary Confinement (DC)",
  "Protective Management (PM)",
  "Close Management I (CM-I)",
  "Close Management II (CM-II)",
  "Close Management III (CM-III)",
];

function formatTime(val: string) {
  return val || "__:__";
}

function formatDate(val: string) {
  if (!val) return "______";
  const d = new Date(val + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function generateNarrative(fields: typeof defaultFields) {
  const isProtection = fields.reason === "Protection Evaluation";
  const reasonText = isProtection
    ? "pending a protection evaluation"
    : `pending disciplinary review for ${fields.reason}`;

  return `On ${formatDate(fields.date)}, at approximately ${formatTime(fields.time)} hours, I, Officer ${fields.officerName || "[Officer Name]"}, escorted inmate ${fields.inmateName || "[Inmate Name]"}, DC# ${fields.dcNumber || "[DC#]"}, to ${fields.confinementType || "Administrative Confinement"}, ${reasonText}.

Prior to placement, inmate ${fields.inmateName || "[Inmate Name]"} was restrained in accordance with established security procedures. A medical staff member conducted a pre-confinement physical to assess the inmate's health status and document any existing injuries or medical conditions prior to placement.

Inmate ${fields.inmateName || "[Inmate Name]"} was afforded the opportunity to make three (3) phone calls in accordance with Florida Administrative Code. The inmate ${fields.callsOffered === "declined" ? "declined" : "was offered"} all three (3) calls.

The inmate was then escorted to confinement. Upon arrival, the assigned bunk is ${fields.bunkAssignment || "[Bunk Assignment]"}. The cell and the inmate's person were searched. Health and comfort items were provided as required.

The inmate's cashless canteen identification was deactivated pending review. All personal property belonging to inmate ${fields.inmateName || "[Inmate Name]"} was collected, searched, inventoried, and stored in accordance with departmental policy.

This placement was authorized by ${fields.captain || "[Captain / Approving Authority]"}, who served as the approving authority.`;
}

const defaultFields = {
  reason: "",
  inmateName: "",
  dcNumber: "",
  date: "",
  time: "",
  captain: "",
  confinementType: "Administrative Confinement (AC)",
  bunkAssignment: "",
  officerName: "",
  callsOffered: "offered",
};

export default function LockUpSlip() {
  const [, navigate] = useLocation();
  const [fields, setFields] = useState(defaultFields);
  const [narrative, setNarrative] = useState("");
  const [copied, setCopied] = useState(false);
  const narrativeRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setNarrative("");
  }

  function handleGenerate() {
    const text = generateNarrative(fields);
    setNarrative(text);
    setTimeout(() => {
      narrativeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function handleCopy() {
    if (!narrative) return;
    navigator.clipboard.writeText(narrative).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const canGenerate = fields.reason && fields.inmateName && fields.dcNumber && fields.date && fields.time && fields.captain && fields.officerName;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate("/")}
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Lock-Up Slip</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Fill in the details below to generate a confinement placement narrative.
        </p>

        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-200/80 leading-relaxed">
            <strong className="text-amber-300">Training Sandbox Mode:</strong> Use fake names, fake DC numbers, and fake information only. Never enter real inmate data, real DC numbers, or any restricted information.
          </p>
        </div>

        <div className="space-y-5 rounded-xl border border-card-border bg-card p-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Reason / Charge <span className="text-destructive">*</span>
            </label>
            <select
              name="reason"
              value={fields.reason}
              onChange={handleChange}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select reason or charge...</option>
              {CHARGES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Inmate Name (Fake) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="inmateName"
                value={fields.inmateName}
                onChange={handleChange}
                placeholder="e.g. John Doe"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                DC Number (Fake) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="dcNumber"
                value={fields.dcNumber}
                onChange={handleChange}
                placeholder="e.g. A12345"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Date <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                name="date"
                value={fields.date}
                onChange={handleChange}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Time (24hr) <span className="text-destructive">*</span>
              </label>
              <input
                type="time"
                name="time"
                value={fields.time}
                onChange={handleChange}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Captain / Approving Authority <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="captain"
              value={fields.captain}
              onChange={handleChange}
              placeholder="e.g. Captain Smith"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Confinement Type
            </label>
            <select
              name="confinementType"
              value={fields.confinementType}
              onChange={handleChange}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CONFINEMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Bunk Assignment
              </label>
              <input
                type="text"
                name="bunkAssignment"
                value={fields.bunkAssignment}
                onChange={handleChange}
                placeholder="e.g. D2-101-L"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Officer Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="officerName"
                value={fields.officerName}
                onChange={handleChange}
                placeholder="e.g. Officer Johnson"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Phone Calls
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="callsOffered"
                  value="offered"
                  checked={fields.callsOffered === "offered"}
                  onChange={handleChange}
                  className="accent-primary"
                />
                <span className="text-foreground">Offered (3 calls)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="callsOffered"
                  value="declined"
                  checked={fields.callsOffered === "declined"}
                  onChange={handleChange}
                  className="accent-primary"
                />
                <span className="text-foreground">Declined by inmate</span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={[
                "w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-150",
                canGenerate
                  ? "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              ].join(" ")}
            >
              Generate Lock-Up Slip Narrative
            </button>
            {!canGenerate && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Fill in all required fields (<span className="text-destructive">*</span>) to generate.
              </p>
            )}
          </div>
        </div>

        {narrative && (
          <div ref={narrativeRef} className="mt-6 rounded-xl border border-card-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Generated Narrative
              </h2>
              <button
                onClick={handleCopy}
                className={[
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  copied
                    ? "border-green-600/40 bg-green-600/10 text-green-400"
                    : "border-border bg-secondary text-foreground hover:border-primary/50",
                ].join(" ")}
              >
                {copied ? (
                  <>
                    <CheckCheck className="h-3.5 w-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Final Text
                  </>
                )}
              </button>
            </div>

            <textarea
              readOnly
              value={narrative}
              rows={18}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground leading-relaxed font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCopy}
                className={[
                  "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all",
                  copied
                    ? "bg-green-600/20 text-green-400 border border-green-600/40"
                    : "bg-primary text-primary-foreground hover:opacity-90",
                ].join(" ")}
              >
                {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied to Clipboard" : "Copy Final Text"}
              </button>
              <button
                onClick={() => navigate("/")}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground hover:border-primary/40 transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
