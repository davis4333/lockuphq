import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Copy, CheckCheck, AlertTriangle, FileText, ChevronDown, Search, X } from "lucide-react";

type Charge = { code: string; title: string };
type Section = { section: string; charges: Charge[] };

const CHARGE_SECTIONS: Section[] = [
  {
    section: "Section 1 — Assault / Battery / Threats / Disrespect",
    charges: [
      { code: "1-1", title: "Assault" },
      { code: "1-2", title: "Battery" },
      { code: "1-3", title: "Spoken or written threats" },
      { code: "1-4", title: "Disrespect to officials" },
      { code: "1-5", title: "Disrespect to inmates" },
      { code: "1-6", title: "Malicious injury to others" },
      { code: "1-7", title: "Sexual assault or sexual battery" },
      { code: "1-8", title: "Sexual harassment" },
    ],
  },
  {
    section: "Section 2 — Riots / Disturbances",
    charges: [
      { code: "2-1", title: "Rioting" },
      { code: "2-2", title: "Inciting to riot" },
      { code: "2-3", title: "Disorderly conduct" },
      { code: "2-4", title: "Disturbance" },
    ],
  },
  {
    section: "Section 3 — Contraband",
    charges: [
      { code: "3-1", title: "Introduction of contraband" },
      { code: "3-2", title: "Possession of contraband" },
      { code: "3-3", title: "Trafficking in contraband" },
      { code: "3-4", title: "Escape paraphernalia" },
      { code: "3-5", title: "Possession of weapons" },
      { code: "3-6", title: "Possession of explosive materials" },
    ],
  },
  {
    section: "Section 4 — Unauthorized Area",
    charges: [
      { code: "4-1", title: "Unauthorized area or location" },
      { code: "4-2", title: "Escape or attempted escape" },
      { code: "4-3", title: "Absent from assignment" },
    ],
  },
  {
    section: "Section 5 — Count Procedure Violations",
    charges: [
      { code: "5-1", title: "Count procedure violation" },
      { code: "5-2", title: "Absence from count" },
    ],
  },
  {
    section: "Section 6 — Disobeying Orders",
    charges: [
      { code: "6-1", title: "Disobeying a verbal order" },
      { code: "6-2", title: "Disobeying a written order" },
      { code: "6-3", title: "Failure to follow safety rules or regulations" },
    ],
  },
  {
    section: "Section 7 — Destruction / Misuse / Waste of Property",
    charges: [
      { code: "7-1", title: "Destruction of state property or property belonging to another" },
      { code: "7-2", title: "Misuse or waste of state property or property belonging to another" },
      { code: "7-3", title: "Arson" },
    ],
  },
  {
    section: "Section 8 — Hygiene",
    charges: [
      { code: "8-1", title: "Unsanitary living area" },
      { code: "8-2", title: "Personal hygiene" },
    ],
  },
  {
    section: "Section 9 — Miscellaneous Infractions",
    charges: [
      { code: "9-1", title: "Lying or providing false information to officials" },
      { code: "9-2", title: "Gambling" },
      { code: "9-3", title: "Tattooing or self-mutilation" },
      { code: "9-4", title: "Unauthorized use of mail, telephone, or visits" },
      { code: "9-5", title: "Failure to work or participate in required programs" },
      { code: "9-6", title: "Fraudulent claim or misrepresentation" },
      { code: "9-7", title: "Unauthorized correspondence or communication" },
      { code: "9-8", title: "Loaning or borrowing" },
      { code: "9-9", title: "Influencing or attempting to influence an official" },
      { code: "9-10", title: "Failure to submit to urinalysis" },
      { code: "9-11", title: "Inciting others to engage in prohibited conduct" },
    ],
  },
  {
    section: "Section 10 — Community Release Program Violations",
    charges: [
      { code: "10-1", title: "Unauthorized absence from community release program" },
      { code: "10-2", title: "Failure to report as required" },
      { code: "10-3", title: "Unauthorized contact with victims or other prohibited persons" },
      { code: "10-4", title: "Unauthorized employment or change of employment" },
      { code: "10-5", title: "Failure to maintain required fees or restitution payments" },
    ],
  },
  {
    section: "Section 11 — Supervised Community Release Program Violations",
    charges: [
      { code: "11-1", title: "Unauthorized absence from supervision" },
      { code: "11-2", title: "Failure to report to supervising officer" },
      { code: "11-3", title: "Violation of conditions of supervised community release" },
    ],
  },
];

const ALL_CHARGES: Charge[] = CHARGE_SECTIONS.flatMap((s) => s.charges);

function chargeLabel(c: Charge) {
  return `${c.code} ${c.title}`;
}

interface ChargePickerProps {
  value: string;
  onChange: (val: string) => void;
}

function ChargePicker({ value, onChange }: ChargePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const query = search.trim().toLowerCase();

  const filteredSections = query
    ? CHARGE_SECTIONS.map((s) => ({
        ...s,
        charges: s.charges.filter(
          (c) =>
            c.code.toLowerCase().includes(query) ||
            c.title.toLowerCase().includes(query)
        ),
      })).filter((s) => s.charges.length > 0)
    : CHARGE_SECTIONS;

  const selectedCharge =
    value === "Protection Evaluation"
      ? null
      : ALL_CHARGES.find((c) => chargeLabel(c) === value) ?? null;

  const displayLabel =
    value === "Protection Evaluation"
      ? "Protection Evaluation"
      : selectedCharge
      ? chargeLabel(selectedCharge)
      : "Select charge or reason...";

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  function select(val: string) {
    onChange(val);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
          value
            ? "border-input bg-background text-foreground"
            : "border-input bg-background text-muted-foreground/60",
        ].join(" ")}
      >
        <span className="truncate">{displayLabel}</span>
        <span className="flex items-center gap-1 ml-2 shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), onChange(""))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by number or keyword..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {!query && (
              <button
                type="button"
                onClick={() => select("Protection Evaluation")}
                className={[
                  "w-full text-left px-4 py-2.5 text-sm transition-colors",
                  value === "Protection Evaluation"
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-foreground hover:bg-muted",
                ].join(" ")}
              >
                Protection Evaluation
              </button>
            )}

            {query && "protection evaluation".includes(query) && (
              <button
                type="button"
                onClick={() => select("Protection Evaluation")}
                className={[
                  "w-full text-left px-4 py-2.5 text-sm transition-colors",
                  value === "Protection Evaluation"
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-foreground hover:bg-muted",
                ].join(" ")}
              >
                Protection Evaluation
              </button>
            )}

            {filteredSections.length === 0 && (
              <p className="px-4 py-4 text-sm text-muted-foreground text-center">No charges match your search.</p>
            )}

            {filteredSections.map((sec) => (
              <div key={sec.section}>
                <div className="sticky top-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/80 border-b border-border/40">
                  {sec.section}
                </div>
                {sec.charges.map((c) => {
                  const label = chargeLabel(c);
                  const isSelected = value === label;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => select(label)}
                      className={[
                        "w-full text-left px-4 py-2 text-sm transition-colors flex items-start gap-2",
                        isSelected
                          ? "bg-primary/20 text-primary font-medium"
                          : "text-foreground hover:bg-muted",
                      ].join(" ")}
                    >
                      <span className="shrink-0 font-mono text-xs text-muted-foreground mt-0.5 w-8">{c.code}</span>
                      <span className="leading-snug">{c.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const CONFINEMENT_TYPES = [
  "Administrative Confinement (AC)",
  "Disciplinary Confinement (DC)",
  "Protective Management (PM)",
  "Close Management I (CM-I)",
  "Close Management II (CM-II)",
  "Close Management III (CM-III)",
];

function formatTime(val: string) {
  if (!val) return "____";
  return val.replace(":", "");
}

function formatDate(val: string) {
  if (!val) return "______";
  const d = new Date(val + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function generateNarrative(fields: typeof defaultFields) {
  const isProtection = fields.reason === "Protection Evaluation";
  const pendingText = isProtection ? "Protection Evaluation" : fields.reason;

  const last = (fields.lastName.trim() || "[LAST NAME]").toUpperCase();
  const first = fields.firstName.trim()
    ? fields.firstName.trim().charAt(0).toUpperCase() + fields.firstName.trim().slice(1).toLowerCase()
    : "[First Name]";
  const nameDisplay = `${last}, ${first}`;
  const dcNum = (fields.dcNumber.trim() || "[DC#]").toUpperCase();
  const captain = fields.captain.trim().replace(/^captain\s+/i, "").trim() || "[Captain Name]";
  const confinement = fields.confinementType || "Administrative Confinement (AC)";
  const pronoun = fields.pronoun === "she" ? "she" : "he";
  const bunk = fields.bunkAssignment.trim()
    ? ` Inmate ${last} was assigned to bunk ${fields.bunkAssignment.trim()}.`
    : "";

  const callLine = fields.callsOffered === "declined"
    ? `Inmate ${last} declined the opportunity to make three phone calls to advise a visitor that ${pronoun} would be unavailable for visitation.`
    : `Inmate ${last} was afforded the opportunity to make three phone calls to advise a visitor that ${pronoun} would be unavailable for visitation.`;

  return `On ${formatDate(fields.date)}, at approximately ${formatTime(fields.time)} hours, Inmate ${nameDisplay}, DC# ${dcNum}, was advised of placement in ${confinement} pending ${pendingText}. Per Captain ${captain}, Inmate ${last} was placed in restraints and escorted to medical where a pre-confinement physical was completed. ${callLine} Inmate ${last} was escorted to confinement where ${pronoun} was searched, secured, and issued health and comfort items.${bunk} Inmate ${last}'s cashless ID card was deactivated. Inmate ${last}'s property was collected, searched, inventoried, and delivered/stored by respective dormitory staff.`;
}

const defaultFields = {
  reason: "",
  lastName: "",
  firstName: "",
  dcNumber: "",
  date: "",
  time: "",
  captain: "",
  confinementType: "Administrative Confinement (AC)",
  bunkAssignment: "",
  pronoun: "he",
  callsOffered: "offered",
};

export default function LockUpSlip() {
  const [, navigate] = useLocation();
  const [fields, setFields] = useState(defaultFields);
  const [narrative, setNarrative] = useState("");
  const [copied, setCopied] = useState(false);
  const narrativeRef = useRef<HTMLDivElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setNarrative("");
  }

  function handleReasonChange(val: string) {
    setFields((prev) => ({ ...prev, reason: val }));
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

  const canGenerate =
    fields.reason &&
    fields.lastName &&
    fields.firstName &&
    fields.dcNumber &&
    fields.date &&
    fields.time &&
    fields.captain;

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
            <ChargePicker value={fields.reason} onChange={handleReasonChange} />
            {fields.reason && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Selected: <span className="text-foreground font-medium">{fields.reason}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Last Name (Fake) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="lastName"
                value={fields.lastName}
                onChange={handleChange}
                placeholder="e.g. Doe"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                First Name (Fake) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="firstName"
                value={fields.firstName}
                onChange={handleChange}
                placeholder="e.g. John"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
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
              placeholder="e.g. X00000"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
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
              placeholder="e.g. R. Holmes"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Name only — output will read: Per Captain R. Holmes</p>
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
              <p className="mt-1 text-[11px] text-muted-foreground">Optional — added to narrative if entered</p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Inmate Pronoun
              </label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="pronoun"
                    value="he"
                    checked={fields.pronoun === "he"}
                    onChange={handleChange}
                    className="accent-primary"
                  />
                  <span className="text-foreground">He / Him</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="pronoun"
                    value="she"
                    checked={fields.pronoun === "she"}
                    onChange={handleChange}
                    className="accent-primary"
                  />
                  <span className="text-foreground">She / Her</span>
                </label>
              </div>
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
