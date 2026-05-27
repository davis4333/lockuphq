import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ShieldAlert, Copy, Check, AlertTriangle } from "lucide-react";

const SHIFTS = ["Day Shift (6a–2p)", "Evening Shift (2p–10p)", "Night Shift (10p–6a)"];
const SHIFT_SHORT: Record<string, string> = {
  "Day Shift (6a–2p)": "Day Shift",
  "Evening Shift (2p–10p)": "Evening Shift",
  "Night Shift (10p–6a)": "Night Shift",
};

const CONFINEMENT_TYPES = [
  "Administrative Confinement (AC)",
  "Disciplinary Confinement (DC)",
  "Close Management I (CM-I)",
  "Close Management II (CM-II)",
  "Close Management III (CM-III)",
  "Protective Management (PM)",
];

function formatDate(val: string) {
  if (!val) return "______";
  const d = new Date(val + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function titleCase(s: string) {
  if (!s.trim()) return s;
  return s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase();
}

function formatSupervisorName(raw: string): string {
  if (!raw.trim()) return "[Supervisor Name]";
  let name = raw.trim().replace(/^(sergeant|sgt\.?|lieutenant|lt\.?|captain|cpt\.?|caption|officer|ofc\.?|sso\.?)\s*/i, "").trim();
  name = name.replace(/\.(?=\S)/g, ". ");
  const parts = name.split(/\s+/).filter(Boolean);
  const formatted = parts.map((part) => {
    const clean = part.replace(/\./g, "");
    if (!clean) return "";
    if (clean.length === 1) return clean.toUpperCase() + ".";
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }).filter(Boolean);
  return formatted.join(" ") || "[Supervisor Name]";
}

function generateOutput(fields: typeof defaultFields) {
  const last = titleCase(fields.lastName) || "[Last Name]";
  const first = titleCase(fields.firstName) || "[First Name]";
  const dcNum = (fields.dcNumber.trim() || "[DC#]").toUpperCase();
  const supervisor = formatSupervisorName(fields.supervisorName);
  const chief = formatSupervisorName(fields.chiefName);
  const dateRestricted = formatDate(fields.dateRestricted);
  const restrictionUntil = formatDate(fields.restrictionUntil);
  const shift = SHIFT_SHORT[fields.shift] || fields.shift || "[Shift]";
  const dorm = fields.dormAssignment.trim() || "[Dorm/Assignment]";
  const reason = fields.reasonForRestriction.trim() || "[Reason for Restriction]";
  const items = fields.itemsRestricted.trim() || "[Items Restricted]";
  const approved = fields.approvalStatus !== "denied";
  const mattressYes = fields.mattress === "yes";
  const beddingYes = fields.bedding === "yes";

  const retDate = fields.itemsReturnedDate.trim() ? formatDate(fields.itemsReturnedDate) : "_______________";
  const retShift = fields.itemsReturnedShift.trim()
    ? (SHIFT_SHORT[fields.itemsReturnedShift] || fields.itemsReturnedShift)
    : "_______________";
  const oic = fields.oic.trim() ? formatSupervisorName(fields.oic) : "_______________";
  const comments = fields.comments.trim() || "";

  return [
    `State of Florida`,
    `Department of Corrections`,
    `Okeechobee Correctional Institution`,
    `PROPERTY RESTRICTION FORM`,
    ``,
    `Inmate Name: ${last}, ${first}`,
    `DC#: ${dcNum}`,
    `Date Restricted: ${dateRestricted}    Shift: ${shift}    Dorm/Assignment: ${dorm}`,
    ``,
    `Reason for Restriction: ${reason}`,
    ``,
    `Restrictions: ${items}`,
    ``,
    `${supervisor}    ${dateRestricted}`,
    `Shift Supervisor                                          Date`,
    ``,
    `${chief}    ${dateRestricted}    ${approved ? "[X] Approved  [ ] Denied" : "[ ] Approved  [X] Denied"}`,
    `Correctional Officer Chief                    Date              Approved    Denied`,
    ``,
    `Comments:`,
    comments || ``,
    ``,
    `Items will be restricted at a minimum until: ${restrictionUntil}`,
    ``,
    `Items Returned:  Date ${retDate}    Shift ${retShift}    OIC ${oic}`,
    ``,
    `This form is to be completed and attached to an incident report on all inmates that are placed on property restriction for security reasons. This form does not apply to items or property restricted by Mental Health or Medical Personnel for suicide watch or Alternative Housing. All property restricted and returned must also be documented on the inmate DC6-229. Items will be returned to the inmate when no further behavior or threat of behavior occurs that led to the restriction. If the inmate behavior or threat of behavior continues after 72 hours the Warden must approve for the continuation of the property restriction, this review will be conducted within 72 hours of the restriction. At no time will an inmate be left without the means to cover himself. All property being taken will be inventoried and properly stored in compliance of F.A.C. 33-602.201 Inmate Property.`,
    ``,
    `All state issued clothing and all his personal property. Inmate will be allowed to retain the following items`,
    ``,
    `Mattress:  Yes __${mattressYes ? "X" : "_"}__  No __${mattressYes ? "_" : "X"}__`,
    `Bedding/Linens  Yes __${beddingYes ? "X" : "_"}__  No __${beddingYes ? "_" : "X"}__`,
  ].join("\n");
}

const defaultFields = {
  lastName: "",
  firstName: "",
  dcNumber: "",
  dateRestricted: "",
  shift: "",
  dormAssignment: "",
  reasonForRestriction: "",
  itemsRestricted: "",
  supervisorName: "",
  chiefName: "",
  approvalStatus: "approved",
  restrictionUntil: "",
  itemsReturnedDate: "",
  itemsReturnedShift: "",
  oic: "",
  comments: "",
  mattress: "no",
  bedding: "no",
};

export default function PropertyRestriction() {
  const [, navigate] = useLocation();
  const [fields, setFields] = useState(defaultFields);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setOutput("");
  }

  function handleGenerate() {
    const text = generateOutput(fields);
    setOutput(text);
    setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function handleCopy() {
    if (!output) return;
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const canGenerate =
    fields.lastName &&
    fields.firstName &&
    fields.dcNumber &&
    fields.dateRestricted &&
    fields.shift &&
    fields.dormAssignment &&
    fields.reasonForRestriction &&
    fields.itemsRestricted &&
    fields.supervisorName &&
    fields.chiefName &&
    fields.restrictionUntil;

  const labelClass = "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1";
  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40";

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
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Strip / Property Restriction
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Fill in the details below to generate the completed Property Restriction Form.
        </p>
        <div className="mb-6 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/8 px-3 py-2.5">
          <span className="mt-0.5 text-primary text-xs">📋</span>
          <p className="text-xs text-primary/90 leading-relaxed">
            <span className="font-semibold">This output is designed to be copied/printed as the door/officer station form.</span>{" "}
            All entered information is placed directly into the official Property Restriction Form layout — including fixed policy language, signature lines, approval status, and Yes/No markings — exactly as it appears on the physical document.
          </p>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-200/80 leading-relaxed">
            <span className="font-semibold text-amber-300">Training Sandbox Mode:</span> Use fake
            names, fake DC numbers, and fake information only. Never enter real inmate data, real DC
            numbers, or any restricted information.
          </p>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-6 space-y-5">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Last Name (Fake) <span className="text-destructive">*</span></label>
              <input
                name="lastName"
                value={fields.lastName}
                onChange={handleChange}
                placeholder="e.g. Doe"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>First Name (Fake) <span className="text-destructive">*</span></label>
              <input
                name="firstName"
                value={fields.firstName}
                onChange={handleChange}
                placeholder="e.g. John"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>DC Number (Fake) <span className="text-destructive">*</span></label>
            <input
              name="dcNumber"
              value={fields.dcNumber}
              onChange={handleChange}
              placeholder="e.g. X00000"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date Restricted <span className="text-destructive">*</span></label>
              <input
                type="date"
                name="dateRestricted"
                value={fields.dateRestricted}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Shift <span className="text-destructive">*</span></label>
              <select
                name="shift"
                value={fields.shift}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="">Select shift...</option>
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Dorm / Assignment <span className="text-destructive">*</span></label>
            <input
              name="dormAssignment"
              value={fields.dormAssignment}
              onChange={handleChange}
              placeholder="e.g. D2, CM-I, G-Dorm"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Reason for Restriction <span className="text-destructive">*</span></label>
            <textarea
              name="reasonForRestriction"
              value={fields.reasonForRestriction}
              onChange={handleChange}
              rows={3}
              placeholder="e.g. Inmate refused to comply with housing rules and posed a threat to security of the institution."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Restrictions / Items Restricted <span className="text-destructive">*</span></label>
            <textarea
              name="itemsRestricted"
              value={fields.itemsRestricted}
              onChange={handleChange}
              rows={3}
              placeholder="e.g. All personal property, clothing, books, and hygiene items except state-issued items."
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Mattress Restricted?</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="mattress"
                    value="yes"
                    checked={fields.mattress === "yes"}
                    onChange={handleChange}
                    className="accent-primary"
                  />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="mattress"
                    value="no"
                    checked={fields.mattress === "no"}
                    onChange={handleChange}
                    className="accent-primary"
                  />
                  No
                </label>
              </div>
            </div>
            <div>
              <label className={labelClass}>Bedding / Linens Restricted?</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="bedding"
                    value="yes"
                    checked={fields.bedding === "yes"}
                    onChange={handleChange}
                    className="accent-primary"
                  />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="bedding"
                    value="no"
                    checked={fields.bedding === "no"}
                    onChange={handleChange}
                    className="accent-primary"
                  />
                  No
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Shift Supervisor Name <span className="text-destructive">*</span></label>
              <input
                name="supervisorName"
                value={fields.supervisorName}
                onChange={handleChange}
                placeholder="e.g. R. Holmes"
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-amber-400/80">
                Enter name only, no title. Example: R. Holmes
              </p>
            </div>
            <div>
              <label className={labelClass}>Chief / Colonel Approval Name <span className="text-destructive">*</span></label>
              <input
                name="chiefName"
                value={fields.chiefName}
                onChange={handleChange}
                placeholder="e.g. T. Davis"
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-amber-400/80">
                Enter name only, no title. Example: T. Davis
              </p>
            </div>
          </div>

          <div>
            <label className={labelClass}>Approved or Denied <span className="text-destructive">*</span></label>
            <div className="flex gap-6 mt-1">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="approvalStatus"
                  value="approved"
                  checked={fields.approvalStatus === "approved"}
                  onChange={handleChange}
                  className="accent-primary"
                />
                Approved
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="approvalStatus"
                  value="denied"
                  checked={fields.approvalStatus === "denied"}
                  onChange={handleChange}
                  className="accent-primary"
                />
                Denied
              </label>
            </div>
          </div>

          <div>
            <label className={labelClass}>Minimum Restriction Until Date <span className="text-destructive">*</span></label>
            <input
              type="date"
              name="restrictionUntil"
              value={fields.restrictionUntil}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Comments / Narrative <span className="text-[10px] normal-case tracking-normal font-normal text-muted-foreground/60">(optional)</span></label>
            <textarea
              name="comments"
              value={fields.comments}
              onChange={handleChange}
              rows={3}
              placeholder="Any additional comments or narrative notes..."
              className={inputClass}
            />
          </div>

          <div className="border-t border-border/40 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Items Returned <span className="normal-case tracking-normal font-normal">(complete when property is returned)</span>
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Date Returned</label>
                <input
                  type="date"
                  name="itemsReturnedDate"
                  value={fields.itemsReturnedDate}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Shift Returned</label>
                <select
                  name="itemsReturnedShift"
                  value={fields.itemsReturnedShift}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select shift...</option>
                  {SHIFTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>OIC</label>
                <input
                  name="oic"
                  value={fields.oic}
                  onChange={handleChange}
                  placeholder="e.g. M. Johnson"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

        </div>

        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={[
            "mt-6 w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-150",
            canGenerate
              ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          ].join(" ")}
        >
          Generate Property Restriction Form
        </button>
        {!canGenerate && (
          <p className="mt-2 text-center text-xs text-muted-foreground/60">
            Fill in all required fields (*) to generate.
          </p>
        )}

        {output && (
          <div ref={outputRef} className="mt-8">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Completed Form — Ready to Copy / Print
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Copy this text and paste it into a document to print for the door and officer station.
                </p>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors shrink-0 ml-4"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Text
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 rounded-xl border-2 border-primary/25 bg-card shadow-inner">
              <div className="flex items-center gap-2 border-b border-border/50 px-5 py-2.5 bg-primary/5 rounded-t-xl">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                  Property Restriction Form — Form Preview
                </span>
              </div>
              <div className="p-5">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-mono">
                  {output}
                </pre>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
              <button
                onClick={() => navigate("/")}
                className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
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
