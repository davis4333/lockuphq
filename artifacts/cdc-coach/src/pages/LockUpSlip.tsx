import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Copy, CheckCheck, AlertTriangle, FileText, ChevronDown, Search, X, Download, CalendarDays } from "lucide-react";
import PageShell, { hudPanel, hudInput, hudLabel } from "@/components/PageShell";
import { buildWeekDays, isSunday, previousSunday, parseLocalDate, toIso, numericDate } from "@/lib/dc6229/weekDates";
import { stripDormLetter } from "@/lib/dc6229/cellNumber";
import { fillDc6229Docx, Dc6229DocxError, type Dc6229FormData } from "@/lib/dc6229/dc6229DocxFiller";

const DC6229_TEMPLATE_URL = `${import.meta.env.BASE_URL}dc6-229-template.docx`;

type Charge = { code: string; title: string };
type Section = { section: string; charges: Charge[] };

const CHARGE_SECTIONS: Section[] = [
  {
    section: "Section 1 — Assault, Battery, Threats, and Disrespect",
    charges: [
      { code: "1-3",  title: "Spoken, written, or gestured threats" },
      { code: "1-4",  title: "Disrespect to officials, employees, or other persons of constituted authority expressed by means of words, gestures, and the like" },
      { code: "1-5",  title: "Sexual battery or attempted sexual battery" },
      { code: "1-6",  title: "Lewd or lascivious exhibition by intentionally masturbating, intentionally exposing genitals in a lewd or lascivious manner, or intentionally committing any other sexual act in the presence of a staff member, contracted staff member or visitor" },
      { code: "1-7",  title: "Aggravated battery or attempted aggravated battery on a correctional officer" },
      { code: "1-8",  title: "Aggravated battery or attempted aggravated battery on staff other than correctional officer" },
      { code: "1-9",  title: "Aggravated battery or attempted aggravated battery on someone other than staff or inmates" },
      { code: "1-10", title: "Aggravated battery or attempted aggravated battery on an inmate" },
      { code: "1-11", title: "Aggravated assault or attempted aggravated assault on a correctional officer" },
      { code: "1-12", title: "Aggravated assault or attempted aggravated assault on staff other than correctional officer" },
      { code: "1-13", title: "Aggravated assault or attempted aggravated assault on someone other than staff or inmates" },
      { code: "1-14", title: "Aggravated assault or attempted aggravated assault on an inmate" },
      { code: "1-15", title: "Battery or attempted battery on a correctional officer" },
      { code: "1-16", title: "Battery or attempted battery on staff other than correctional officer" },
      { code: "1-17", title: "Battery or attempted battery on someone other than staff or inmates" },
      { code: "1-18", title: "Battery or attempted battery on an inmate" },
      { code: "1-19", title: "Assault or attempted assault on a correctional officer" },
      { code: "1-20", title: "Assault or attempted assault on staff other than correctional officer" },
      { code: "1-21", title: "Assault or attempted assault on someone other than staff or inmates" },
      { code: "1-22", title: "Assault or attempted assault on an inmate" },
    ],
  },
  {
    section: "Section 2 — Riots, Strikes, Mutinous Acts and Disturbances",
    charges: [
      { code: "2-1", title: "Participating in riots, strikes, mutinous acts, or disturbances" },
      { code: "2-2", title: "Inciting or attempting to incite riots, strikes, mutinous acts, or disturbances" },
      { code: "2-3", title: "Creating, participating in or inciting a minor disturbance" },
      { code: "2-4", title: "Fighting" },
    ],
  },
  {
    section: "Section 3 — Contraband",
    charges: [
      { code: "3-1",  title: "Possession of or manufacture of weapons, ammunition, or explosives" },
      { code: "3-2",  title: "Possession of escape paraphernalia" },
      { code: "3-3",  title: "Possession of narcotics, unauthorized drugs and drug paraphernalia" },
      { code: "3-4",  title: "Trafficking in drugs or unauthorized beverages" },
      { code: "3-5",  title: "Manufacture of drugs or unauthorized beverages" },
      { code: "3-6",  title: "Possession of unauthorized beverages" },
      { code: "3-7",  title: "Possession of aromatic stimulants or depressants, such as paint thinner, glue, toluene, etc." },
      { code: "3-8",  title: "Possession of negotiables" },
      { code: "3-9",  title: "Possession of unauthorized or altered identification" },
      { code: "3-10", title: "Possession of unauthorized clothing or linen – State or personal" },
      { code: "3-11", title: "Possession of stolen property – State or personal" },
      { code: "3-12", title: "Possession of any other contraband" },
      { code: "3-13", title: "Introduction of any contraband" },
      { code: "3-14", title: "Possession or use of a cellular telephone or any other type of wireless communication device" },
      { code: "3-15", title: "Possession of gang related paraphernalia or related material, gang symbols, logos, gang colors, drawings, hand signs, or gang related documents" },
    ],
  },
  {
    section: "Section 4 — Unauthorized Area",
    charges: [
      { code: "4-1", title: "Escape or escape attempt" },
      { code: "4-2", title: "Unauthorized absence from assigned area, including housing, job or any other assigned or designated area" },
      { code: "4-3", title: "Being in unauthorized area, including housing, job, or any other assigned or designated area" },
    ],
  },
  {
    section: "Section 5 — Count Procedure Violations",
    charges: [
      { code: "5-1", title: "Missing count" },
      { code: "5-2", title: "Failure to comply with count procedures" },
    ],
  },
  {
    section: "Section 6 — Disobeying Orders",
    charges: [
      { code: "6-1", title: "Disobeying verbal or written order – any order given to an inmate or inmates by a staff member or other authorized person" },
      { code: "6-2", title: "Disobeying institutional regulations" },
    ],
  },
  {
    section: "Section 7 — Destruction, Misuse, or Waste of Property",
    charges: [
      { code: "7-1", title: "Destruction of State property or property belonging to another" },
      { code: "7-2", title: "Altering or defacing State property or property belonging to another" },
      { code: "7-3", title: "Destruction of State property or property belonging to another due to gross negligence" },
      { code: "7-4", title: "Misuse of State property or property belonging to another – use for purpose other than the intended purpose" },
      { code: "7-5", title: "Willful wasting State property or property belonging to another" },
      { code: "7-6", title: "Arson or attempted arson" },
    ],
  },
  {
    section: "Section 8 — Hygiene",
    charges: [
      { code: "8-1", title: "Failure to maintain personal hygiene or appearance" },
      { code: "8-2", title: "Failure to maintain acceptable hygiene or appearance of housing area" },
    ],
  },
  {
    section: "Section 9 — Miscellaneous Infractions",
    charges: [
      { code: "9-1",  title: "Obscene or profane act, gesture, or statement – oral, written, or signified" },
      { code: "9-2",  title: "Bribery or attempted bribery" },
      { code: "9-3",  title: "Breaking and entering or attempted breaking" },
      { code: "9-4",  title: "Attempt, conspiracy, or attempted conspiracy to commit any crime or violation of the Rules of Prohibited Conduct" },
      { code: "9-5",  title: "Theft of property under $50.00 in value" },
      { code: "9-6",  title: "Bartering with others" },
      { code: "9-7",  title: "Sex acts or unauthorized physical contact involving inmates" },
      { code: "9-9",  title: "Tattooing, being tattooed, or body art to include body piercing, scarring or other non-life threatening acts" },
      { code: "9-10", title: "Lying to staff member or others in official capacity, or falsifying records" },
      { code: "9-11", title: "Feigning illness or malingering as determined by a physician or medical authority" },
      { code: "9-12", title: "Gambling or possession of gambling paraphernalia" },
      { code: "9-13", title: "Insufficient work" },
      { code: "9-14", title: "Mail regulation violations" },
      { code: "9-15", title: "Visiting regulation violations" },
      { code: "9-16", title: "Refusing to work or participate in mandatory programs" },
      { code: "9-17", title: "Disorderly conduct" },
      { code: "9-18", title: "Unauthorized physical contact involving non-inmates" },
      { code: "9-19", title: "Presenting false testimony or information before Disciplinary Team, Hearing Officer, or Investigating Officer" },
      { code: "9-20", title: "Extortion or attempted extortion" },
      { code: "9-21", title: "Fraud or attempted fraud" },
      { code: "9-22", title: "Robbery or attempted robbery" },
      { code: "9-23", title: "Theft of property exceeding $50 in value" },
      { code: "9-24", title: "Loaning or borrowing money or other valuables" },
      { code: "9-25", title: "Telephone regulation violations" },
      { code: "9-26", title: "Refusing to submit to substance abuse testing" },
      { code: "9-27", title: "Use of unauthorized drugs" },
      { code: "9-28", title: "Canteen Shortage under $50.00" },
      { code: "9-29", title: "Canteen Shortage over $50.00" },
      { code: "9-31", title: "Use of Alcohol" },
      { code: "9-32", title: "Frivolous or malicious suit, action, claim, proceeding or appeal, or false information or evidence before the court" },
      { code: "9-33", title: "Tampering with, defeating or depriving staff of any security device" },
      { code: "9-34", title: "Tampering with or defeating any fire or other safety device" },
      { code: "9-35", title: "Establishes or attempts to establish a personal or business relationship with any staff member" },
      { code: "9-36", title: "Gang related activities, including recruitment, organizing, display of symbols, groups, or group photos, promotion or participation" },
    ],
  },
  {
    section: "Section 10 — Community Release Program Violations",
    charges: [
      { code: "10-1", title: "Failure to directly and promptly proceed to and return from designated area by approved method" },
      { code: "10-2", title: "Failure to remain within designated area of release plan" },
      { code: "10-3", title: "Failure to return if plan terminated prior to scheduled time" },
      { code: "10-4", title: "Making unauthorized contact with any individual on behalf of another inmate" },
      { code: "10-5", title: "Deviating from or changing approved plan without permission" },
      { code: "10-6", title: "Making purchase or contract without approval" },
      { code: "10-7", title: "Failure to deposit entire earnings less authorized deductions each pay period" },
      { code: "10-8", title: "Failure to repay advancement of monies as stipulated in the inmate's financial plan" },
    ],
  },
  {
    section: "Section 11 — Supervised Community Release Program Violations",
    charges: [
      { code: "11-1", title: "Violation of the terms and conditions of the Supervised Community Release Agreement assignment to a designated facility" },
      { code: "11-2", title: "Absconding from the Supervised Community Release Program" },
    ],
  },
];

const ALL_CHARGES: Charge[] = CHARGE_SECTIONS.flatMap((s) => s.charges);

// Non-charge placement reasons shown at the top of the picker. `clause` is the
// exact wording dropped into the narrative after "placement in <confinement>"
// so each reads naturally (e.g. it avoids a clumsy double "pending").
const SPECIAL_REASONS = [
  { label: "Protection Evaluation", clause: "pending Protection Evaluation" },
  {
    label: "After Hours Gain Pending Classification Review",
    clause: "as an after hours gain pending classification review",
  },
] as const;

const SPECIAL_REASON_LABELS: string[] = SPECIAL_REASONS.map((r) => r.label);

function isSpecialReason(value: string): boolean {
  return SPECIAL_REASON_LABELS.includes(value);
}

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

  const matchedSpecials = SPECIAL_REASONS.filter(
    (r) => !query || r.label.toLowerCase().includes(query),
  );

  const selectedCharge = isSpecialReason(value)
    ? null
    : ALL_CHARGES.find((c) => chargeLabel(c) === value) ?? null;

  const displayLabel = isSpecialReason(value)
    ? value
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
          "w-full flex items-center justify-between rounded-lg border border-blue-400/40 bg-[rgba(2,8,24,0.72)] px-3 py-2.5 text-sm transition-colors focus:outline-none focus:border-blue-300/70 focus:ring-2 focus:ring-blue-400/30",
          value ? "text-blue-50" : "text-blue-300/40",
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
              className="text-blue-300/60 hover:text-blue-100"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-blue-300/60 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-blue-400/45 bg-[rgba(4,11,34,0.97)] backdrop-blur-lg shadow-xl overflow-hidden"
          style={{ boxShadow: "0 0 24px rgba(37,99,235,0.25)" }}>
          <div className="flex items-center gap-2 border-b border-blue-400/20 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-blue-300/60" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by number or keyword..."
              className="flex-1 bg-transparent text-sm text-blue-50 placeholder:text-blue-300/35 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-blue-300/60 hover:text-blue-100">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {matchedSpecials.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => select(r.label)}
                className={[
                  "w-full text-left px-4 py-2.5 text-sm transition-colors",
                  value === r.label
                    ? "bg-blue-500/20 text-blue-200 font-medium"
                    : "text-blue-100 hover:bg-blue-500/10",
                ].join(" ")}
              >
                {r.label}
              </button>
            ))}

            {filteredSections.length === 0 && matchedSpecials.length === 0 && (
              <p className="px-4 py-4 text-sm text-muted-foreground text-center">No charges or reasons match your search.</p>
            )}

            {filteredSections.map((sec) => (
              <div key={sec.section}>
                <div className="sticky top-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-200/70 bg-[rgba(7,16,42,0.95)] border-b border-blue-400/15">
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
                          ? "bg-blue-500/20 text-blue-200 font-medium"
                          : "text-blue-100 hover:bg-blue-500/10",
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

function formatCaptainName(raw: string): string {
  if (!raw.trim()) return "[Captain Name]";
  let name = raw.trim().replace(/^(captain|caption)\s*/i, "").trim();
  name = name.replace(/\.(?=\S)/g, ". ");
  const parts = name.split(/\s+/).filter(Boolean);
  const formatted = parts.map((part) => {
    const clean = part.replace(/\./g, "");
    if (!clean) return "";
    if (clean.length === 1) return clean.toUpperCase() + ".";
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }).filter(Boolean);
  return formatted.join(" ") || "[Captain Name]";
}

function generateNarrative(fields: typeof defaultFields) {
  const special = SPECIAL_REASONS.find((r) => r.label === fields.reason);
  const reasonClause = special ? special.clause : `pending ${fields.reason}`;

  const rawLast = fields.lastName.trim() || "[Last Name]";
  const last = rawLast.charAt(0).toUpperCase() + rawLast.slice(1).toLowerCase();
  const rawFirst = fields.firstName.trim() || "[First Name]";
  const first = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
  const nameDisplay = `${last}, ${first}`;
  const dcNum = (fields.dcNumber.trim() || "[DC#]").toUpperCase();
  const captain = formatCaptainName(fields.captain);
  const confinement = fields.confinementType || "Administrative Confinement (AC)";
  const pronoun = fields.pronoun === "she" ? "she" : "he";
  const bunk = fields.bunkAssignment.trim()
    ? ` Inmate ${last} was assigned to bunk ${fields.bunkAssignment.trim()}.`
    : "";

  const callLine = fields.callsOffered === "declined"
    ? `Inmate ${last} declined the opportunity to make three phone calls to advise a visitor that ${pronoun} would be unavailable for visitation.`
    : `Inmate ${last} was afforded the opportunity to make three phone calls to advise a visitor that ${pronoun} would be unavailable for visitation.`;

  return `On ${formatDate(fields.date)}, at approximately ${formatTime(fields.time)} hours, Inmate ${nameDisplay}, DC# ${dcNum}, was advised of placement in ${confinement} ${reasonClause}. Per Captain ${captain}, Inmate ${last} was placed in restraints and escorted to medical where a pre-confinement physical was completed. ${callLine} Inmate ${last} was escorted to confinement where ${pronoun} was searched, secured, and issued health and comfort items.${bunk} Inmate ${last}'s cashless ID card was deactivated. Inmate ${last}'s property was collected, searched, inventoried, and delivered/stored by respective dormitory staff.`;
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

function capitalizeWord(raw: string): string {
  const t = (raw ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

/**
 * Week start for the auto-filled DC6-229 daily grid. Uses the most recent Sunday
 * on or before today; if today IS Sunday, it steps back a full week so the grid
 * covers the week that just ended (Sun..Sat, ending on yesterday's Saturday).
 */
function autoDc6229WeekStartIso(): string {
  const todayIso = toIso(new Date());
  let ws = previousSunday(todayIso);
  if (isSunday(todayIso)) {
    const d = parseLocalDate(ws);
    if (d) {
      d.setDate(d.getDate() - 7);
      ws = toIso(d);
    }
  }
  return ws;
}

/** The parenthetical code of a confinement type, e.g. "...(AC)" -> "AC". */
function confinementStatusCode(confinementType: string): string {
  const m = /\(([^)]+)\)/.exec(confinementType ?? "");
  return (m ? m[1] : confinementType ?? "").trim();
}

function dashedWeekLabel(iso: string): string {
  const d = parseLocalDate(iso);
  return d ? numericDate(d).replace(/\//g, "-") : "UNDATED";
}

export default function LockUpSlip() {
  const [, navigate] = useLocation();
  const [fields, setFields] = useState(defaultFields);
  const [narrative, setNarrative] = useState("");
  const [copied, setCopied] = useState(false);
  const narrativeRef = useRef<HTMLDivElement>(null);
  const [dc6229Generating, setDc6229Generating] = useState(false);
  const [dc6229Error, setDc6229Error] = useState("");
  const dc6229Week = useMemo(() => buildWeekDays(autoDc6229WeekStartIso(), "dayPrefixed"), []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setNarrative("");
    setDc6229Error("");
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

  const canDownloadDc6229 = !!(
    fields.lastName.trim() &&
    fields.firstName.trim() &&
    fields.dcNumber.trim()
  );

  async function handleDownloadDc6229() {
    setDc6229Error("");
    if (!canDownloadDc6229) {
      setDc6229Error("Enter the last name, first name, and DC number first.");
      return;
    }
    setDc6229Generating(true);
    try {
      const weekStartIso = autoDc6229WeekStartIso();
      const week = buildWeekDays(weekStartIso, "dayPrefixed");
      if (week.length !== 7) {
        setDc6229Error("Could not build the 7 week dates. Try again.");
        return;
      }
      const last = capitalizeWord(fields.lastName) || "Last";
      const first = capitalizeWord(fields.firstName) || "First";
      const form: Dc6229FormData = {
        inmateName: `${last}, ${first}`,
        fdc: fields.dcNumber.trim().toUpperCase(),
        cellNumber: stripDormLetter(fields.bunkAssignment),
        status: confinementStatusCode(fields.confinementType),
        dates: week.map((d) => d.docx),
      };
      const blob = await fillDc6229Docx(`${DC6229_TEMPLATE_URL}?v=${Date.now()}`, { forms: [form] });
      const name = `DC6-229 Daily Record - ${last}, ${first} - Week of ${dashedWeekLabel(weekStartIso)}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof Dc6229DocxError) setDc6229Error(err.message);
      else setDc6229Error(`DC6-229 generation failed: ${String(err)}`);
    } finally {
      setDc6229Generating(false);
    }
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
    <PageShell
      title="Lock-Up Slip"
      icon={FileText}
      subtitle="Fill in the details below to generate a confinement placement narrative."
    >
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-400/70 bg-[rgba(28,18,2,0.72)] backdrop-blur-md px-4 py-3"
        style={{ boxShadow: "0 0 20px rgba(245,158,11,0.18)" }}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs text-amber-200/80 leading-relaxed">
          <strong className="text-amber-300">Training Sandbox Mode:</strong> Use fake names, fake DC numbers, and fake information only. Never enter real inmate data, real DC numbers, or any restricted information.
        </p>
      </div>

      <div className={`${hudPanel} p-6 space-y-5`}>
          <div>
            <label className={hudLabel}>
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
              <label className={hudLabel}>
                Last Name (Fake) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="lastName"
                value={fields.lastName}
                onChange={handleChange}
                placeholder="e.g. Doe"
                className={hudInput}
              />
            </div>
            <div>
              <label className={hudLabel}>
                First Name (Fake) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                name="firstName"
                value={fields.firstName}
                onChange={handleChange}
                placeholder="e.g. John"
                className={hudInput}
              />
            </div>
          </div>

          <div>
            <label className={hudLabel}>
              DC Number (Fake) <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="dcNumber"
              value={fields.dcNumber}
              onChange={handleChange}
              placeholder="e.g. X00000"
              className={hudInput}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={hudLabel}>
                Date <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                name="date"
                value={fields.date}
                onChange={handleChange}
                className={hudInput}
              />
            </div>
            <div>
              <label className={hudLabel}>
                Time (24hr) <span className="text-destructive">*</span>
              </label>
              <input
                type="time"
                name="time"
                value={fields.time}
                onChange={handleChange}
                className={hudInput}
              />
            </div>
          </div>

          <div>
            <label className={hudLabel}>
              Captain / Approving Authority <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="captain"
              value={fields.captain}
              onChange={handleChange}
              placeholder="e.g. R. Holmes"
              className={hudInput}
            />
            <p className="mt-1 text-[11px] text-amber-400/80">Enter name only, no title. Example: R. Holmes — output will read: Per Captain R. Holmes</p>
          </div>

          <div>
            <label className={hudLabel}>
              Confinement Type
            </label>
            <select
              name="confinementType"
              value={fields.confinementType}
              onChange={handleChange}
              className={hudInput}
            >
              {CONFINEMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={hudLabel}>
                Bunk Assignment
              </label>
              <input
                type="text"
                name="bunkAssignment"
                value={fields.bunkAssignment}
                onChange={handleChange}
                placeholder="e.g. D2-101-L"
                className={hudInput}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Optional — added to narrative if entered</p>
            </div>
            <div>
              <label className={hudLabel}>
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
            <label className={hudLabel}>
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
                "w-full rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] transition-all duration-150",
                canGenerate
                  ? "border border-blue-300/50 bg-blue-600/85 text-white hover:bg-blue-500 cursor-pointer"
                  : "border border-blue-400/15 bg-[rgba(4,11,34,0.6)] text-blue-300/40 cursor-not-allowed",
              ].join(" ")}
              style={canGenerate ? { boxShadow: "0 0 20px rgba(37,99,235,0.35)" } : undefined}
            >
              Generate Lock-Up Slip Narrative
            </button>
            {!canGenerate && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Fill in all required fields (<span className="text-destructive">*</span>) to generate.
              </p>
            )}
          </div>

          <div className="pt-4 mt-1 border-t border-blue-400/15">
            <div className="mb-1.5 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-300/80" />
              <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-blue-100">
                Also Generate a DC6-229
              </h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
              Builds a Daily Record of Special Housing (DC6-229) from the name, DC number, bunk, and confinement type above. The 7 daily dates fill automatically for the current week — back to the most recent Sunday, or the prior week (ending Saturday) when today is Sunday.
            </p>

            {dc6229Week.length === 7 && (
              <div className="mb-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                {dc6229Week.map((d) => (
                  <div
                    key={d.iso}
                    className="rounded border border-blue-400/20 bg-[rgba(4,11,34,0.6)] px-1.5 py-1 text-center"
                  >
                    <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-blue-300/60">{d.dayName}</div>
                    <div className="text-[11px] font-mono font-semibold text-blue-50">{d.date}</div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleDownloadDc6229}
              disabled={!canDownloadDc6229 || dc6229Generating}
              className={[
                "w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] transition-all duration-150",
                canDownloadDc6229 && !dc6229Generating
                  ? "border border-blue-300/50 bg-blue-600/85 text-white hover:bg-blue-500 cursor-pointer"
                  : "border border-blue-400/15 bg-[rgba(4,11,34,0.6)] text-blue-300/40 cursor-not-allowed",
              ].join(" ")}
              style={canDownloadDc6229 && !dc6229Generating ? { boxShadow: "0 0 20px rgba(37,99,235,0.35)" } : undefined}
            >
              <Download className="h-4 w-4" />
              {dc6229Generating ? "Generating…" : "Download DC6-229"}
            </button>

            {dc6229Error && (
              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-red-300/90">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {dc6229Error}
              </p>
            )}
            {!canDownloadDc6229 && !dc6229Error && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Enter last name, first name, and DC number to enable.
              </p>
            )}
          </div>
        </div>

        {narrative && (
          <div ref={narrativeRef} className={`mt-6 ${hudPanel} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-blue-100 uppercase tracking-[0.16em]">
                Generated Narrative
              </h2>
              <button
                onClick={handleCopy}
                className={[
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  copied
                    ? "border-green-600/40 bg-green-600/10 text-green-400"
                    : "border-blue-400/40 bg-[rgba(2,8,24,0.6)] text-blue-100 hover:border-blue-300/60",
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
              className="w-full rounded-lg border border-blue-400/40 bg-[rgba(2,8,24,0.72)] px-4 py-3 text-sm text-blue-50 leading-relaxed font-mono resize-none focus:outline-none focus:border-blue-300/70 focus:ring-2 focus:ring-blue-400/30"
            />

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCopy}
                className={[
                  "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all",
                  copied
                    ? "bg-green-600/20 text-green-400 border border-green-600/40"
                    : "border border-blue-300/50 bg-blue-600/85 text-white hover:bg-blue-500",
                ].join(" ")}
              >
                {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied to Clipboard" : "Copy Final Text"}
              </button>
              <button
                onClick={() => navigate("/")}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-blue-400/30 bg-[rgba(4,11,34,0.7)] px-4 py-3 text-sm font-semibold text-blue-100 hover:border-blue-300/60 transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
    </PageShell>
  );
}
