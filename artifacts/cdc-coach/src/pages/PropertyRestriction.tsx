import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ShieldAlert, Copy, Check, AlertTriangle, Printer, FileDown } from "lucide-react";

const SHIFTS = ["Day Shift (6a–2p)", "Evening Shift (2p–10p)", "Night Shift (10p–6a)"];
const SHIFT_SHORT: Record<string, string> = {
  "Day Shift (6a–2p)": "Day Shift",
  "Evening Shift (2p–10p)": "Evening Shift",
  "Night Shift (10p–6a)": "Night Shift",
};

function formatDate(val: string) {
  if (!val) return "";
  const d = new Date(val + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function titleCase(s: string) {
  if (!s.trim()) return s;
  return s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase();
}

function formatSupervisorName(raw: string): string {
  if (!raw.trim()) return "";
  let name = raw.trim().replace(/^(sergeant|sgt\.?|lieutenant|lt\.?|captain|cpt\.?|caption|officer|ofc\.?|sso\.?)\s*/i, "").trim();
  name = name.replace(/\.(?=\S)/g, ". ");
  const parts = name.split(/\s+/).filter(Boolean);
  const formatted = parts.map((part) => {
    const clean = part.replace(/\./g, "");
    if (!clean) return "";
    if (clean.length === 1) return clean.toUpperCase() + ".";
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }).filter(Boolean);
  return formatted.join(" ") || "";
}

function generateTextOutput(fields: typeof defaultFields) {
  const last = titleCase(fields.lastName) || "[Last Name]";
  const first = titleCase(fields.firstName) || "[First Name]";
  const dcNum = (fields.dcNumber.trim() || "[DC#]").toUpperCase();
  const supervisor = formatSupervisorName(fields.supervisorName) || "[Supervisor Name]";
  const chief = formatSupervisorName(fields.chiefName) || "[Chief Name]";
  const dateRestricted = formatDate(fields.dateRestricted) || "______";
  const restrictionUntil = formatDate(fields.restrictionUntil) || "______";
  const shift = SHIFT_SHORT[fields.shift] || fields.shift || "[Shift]";
  const dorm = fields.dormAssignment.trim() || "[Dorm/Assignment]";
  const reason = fields.reasonForRestriction.trim() || "[Reason for Restriction]";
  const items = fields.itemsRestricted.trim() || "[Items Restricted]";
  const approved = fields.approvalStatus !== "denied";
  const mattressYes = fields.mattress === "yes";
  const beddingYes = fields.bedding === "yes";
  const retDate = fields.itemsReturnedDate.trim() ? formatDate(fields.itemsReturnedDate) : "_______________";
  const retShift = fields.itemsReturnedShift.trim() ? (SHIFT_SHORT[fields.itemsReturnedShift] || fields.itemsReturnedShift) : "_______________";
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
    comments,
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

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      width: 14,
      height: 14,
      border: "1.5px solid #000",
      marginRight: 4,
      verticalAlign: "middle",
      textAlign: "center",
      lineHeight: "12px",
      fontSize: 11,
      fontWeight: "bold",
    }}>
      {checked ? "X" : ""}
    </span>
  );
}

function Field({ value, width = 180, minWidth }: { value: string; width?: number; minWidth?: number }) {
  return (
    <span style={{
      display: "inline-block",
      borderBottom: "1px solid #000",
      minWidth: minWidth ?? width,
      width: value ? "auto" : width,
      paddingLeft: 3,
      paddingRight: 6,
      fontWeight: value ? 600 : 400,
    }}>
      {value || "\u00a0".repeat(Math.floor((minWidth ?? width) / 7))}
    </span>
  );
}

function PrintableForm({ fields }: { fields: typeof defaultFields }) {
  const last = titleCase(fields.lastName) || "";
  const first = titleCase(fields.firstName) || "";
  const dcNum = (fields.dcNumber.trim() || "").toUpperCase();
  const supervisor = formatSupervisorName(fields.supervisorName);
  const chief = formatSupervisorName(fields.chiefName);
  const dateRestricted = formatDate(fields.dateRestricted);
  const restrictionUntil = formatDate(fields.restrictionUntil);
  const shift = SHIFT_SHORT[fields.shift] || fields.shift || "";
  const dorm = fields.dormAssignment.trim();
  const reason = fields.reasonForRestriction.trim();
  const items = fields.itemsRestricted.trim();
  const approved = fields.approvalStatus !== "denied";
  const mattressYes = fields.mattress === "yes";
  const beddingYes = fields.bedding === "yes";
  const retDate = fields.itemsReturnedDate.trim() ? formatDate(fields.itemsReturnedDate) : "";
  const retShift = fields.itemsReturnedShift.trim() ? (SHIFT_SHORT[fields.itemsReturnedShift] || fields.itemsReturnedShift) : "";
  const oic = fields.oic.trim() ? formatSupervisorName(fields.oic) : "";
  const comments = fields.comments.trim();

  const s: React.CSSProperties = {
    fontFamily: "Times New Roman, Times, serif",
    fontSize: 12,
    color: "#000",
    lineHeight: 1.55,
  };

  const hrStyle: React.CSSProperties = {
    border: "none",
    borderTop: "1px solid #000",
    margin: "6px 0",
  };

  const sigLineStyle: React.CSSProperties = {
    display: "inline-block",
    borderBottom: "1px solid #000",
    minWidth: 200,
    marginRight: 30,
  };

  const labelSmall: React.CSSProperties = {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#333",
    display: "block",
    marginTop: 1,
  };

  return (
    <div
      id="prop-restriction-printable"
      style={{
        background: "#fff",
        color: "#000",
        width: "7.5in",
        minHeight: "10in",
        margin: "0 auto",
        padding: "0.55in 0.65in",
        boxSizing: "border-box",
        ...s,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13 }}>State of Florida</div>
        <div style={{ fontSize: 13 }}>Department of Corrections</div>
        <div style={{ fontSize: 13 }}>Okeechobee Correctional Institution</div>
        <div style={{ fontSize: 16, fontWeight: "bold", marginTop: 4, textDecoration: "underline" }}>
          PROPERTY RESTRICTION FORM
        </div>
      </div>

      <hr style={hrStyle} />

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
        <tbody>
          <tr>
            <td style={{ paddingBottom: 8, width: "55%" }}>
              <span style={{ fontWeight: "bold" }}>Inmate Name: </span>
              <Field value={last && first ? `${last}, ${first}` : ""} width={220} />
            </td>
            <td style={{ paddingBottom: 8 }}>
              <span style={{ fontWeight: "bold" }}>DC#: </span>
              <Field value={dcNum} width={120} />
            </td>
          </tr>
          <tr>
            <td style={{ paddingBottom: 8 }}>
              <span style={{ fontWeight: "bold" }}>Date Restricted: </span>
              <Field value={dateRestricted} width={110} />
            </td>
            <td style={{ paddingBottom: 8 }}>
              <span style={{ fontWeight: "bold" }}>Shift: </span>
              <Field value={shift} width={100} />
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ paddingBottom: 8 }}>
              <span style={{ fontWeight: "bold" }}>Dorm/Assignment: </span>
              <Field value={dorm} width={300} />
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={hrStyle} />

      <div style={{ marginTop: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: "bold", marginBottom: 3 }}>Reason for Restriction:</div>
        <div style={{
          border: "1px solid #000",
          minHeight: 50,
          padding: "4px 6px",
          fontSize: 12,
        }}>
          {reason}
        </div>
      </div>

      <div style={{ marginTop: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: "bold", marginBottom: 3 }}>Restrictions:</div>
        <div style={{
          border: "1px solid #000",
          minHeight: 50,
          padding: "4px 6px",
          fontSize: 12,
        }}>
          {items}
        </div>
      </div>

      <hr style={{ ...hrStyle, marginTop: 12 }} />

      <div style={{ marginTop: 10, display: "flex", gap: 40 }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderBottom: "1px solid #000", minHeight: 24, fontWeight: 600 }}>
            {supervisor}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={labelSmall}>Shift Supervisor</span>
            <span style={labelSmall}>Date</span>
          </div>
          <div style={{ marginTop: 2 }}>
            <Field value={dateRestricted} width={130} />
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ borderBottom: "1px solid #000", minHeight: 24, fontWeight: 600 }}>
            {chief}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={labelSmall}>Correctional Officer Chief</span>
            <span style={labelSmall}>Date</span>
          </div>
          <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 20 }}>
            <Field value={dateRestricted} width={110} />
            <span>
              <Checkbox checked={approved} />
              <span style={{ marginRight: 16 }}>Approved</span>
              <Checkbox checked={!approved} />
              <span>Denied</span>
            </span>
          </div>
        </div>
      </div>

      <hr style={{ ...hrStyle, marginTop: 12 }} />

      <div style={{ marginTop: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: "bold", marginBottom: 3 }}>Comments:</div>
        <div style={{
          border: "1px solid #000",
          minHeight: 56,
          padding: "4px 6px",
          fontSize: 12,
        }}>
          {comments}
        </div>
      </div>

      <hr style={{ ...hrStyle, marginTop: 10 }} />

      <div style={{ marginTop: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: "bold" }}>Items will be restricted at a minimum until: </span>
        <Field value={restrictionUntil} width={160} />
      </div>

      <div style={{ marginTop: 6, marginBottom: 6 }}>
        <span style={{ fontWeight: "bold" }}>Items Returned: </span>
        <span style={{ marginLeft: 6, marginRight: 20 }}>
          <span style={{ fontWeight: "bold" }}>Date </span>
          <Field value={retDate} width={110} />
        </span>
        <span style={{ marginRight: 20 }}>
          <span style={{ fontWeight: "bold" }}>Shift </span>
          <Field value={retShift} width={90} />
        </span>
        <span>
          <span style={{ fontWeight: "bold" }}>OIC </span>
          <Field value={oic} width={130} />
        </span>
      </div>

      <hr style={{ ...hrStyle, marginTop: 10 }} />

      <div style={{ marginTop: 8, fontSize: 10.5, lineHeight: 1.5, textAlign: "justify" }}>
        This form is to be completed and attached to an incident report on all inmates that are placed on property restriction for security reasons. This form does not apply to items or property restricted by Mental Health or Medical Personnel for suicide watch or Alternative Housing. All property restricted and returned must also be documented on the inmate DC6-229. Items will be returned to the inmate when no further behavior or threat of behavior occurs that led to the restriction. If the inmate behavior or threat of behavior continues after 72 hours the Warden must approve for the continuation of the property restriction, this review will be conducted within 72 hours of the restriction. At no time will an inmate be left without the means to cover himself. All property being taken will be inventoried and properly stored in compliance of F.A.C. 33-602.201 Inmate Property.
      </div>

      <div style={{ marginTop: 8, fontSize: 10.5 }}>
        All state issued clothing and all his personal property. Inmate will be allowed to retain the following items
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 48, fontSize: 12 }}>
        <div>
          <span style={{ fontWeight: "bold" }}>Mattress: </span>
          <span style={{ marginLeft: 8, marginRight: 4 }}>
            <Checkbox checked={mattressYes} /> Yes
          </span>
          <span style={{ marginLeft: 20, marginRight: 4 }}>
            <Checkbox checked={!mattressYes} /> No
          </span>
        </div>
        <div>
          <span style={{ fontWeight: "bold" }}>Bedding/Linens </span>
          <span style={{ marginLeft: 8, marginRight: 4 }}>
            <Checkbox checked={beddingYes} /> Yes
          </span>
          <span style={{ marginLeft: 20, marginRight: 4 }}>
            <Checkbox checked={!beddingYes} /> No
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PropertyRestriction() {
  const [, navigate] = useLocation();
  const [fields, setFields] = useState(defaultFields);
  const [generated, setGenerated] = useState(false);
  const [textOutput, setTextOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "prop-restriction-print-css";
    style.innerHTML = `
      @media print {
        body * { visibility: hidden !important; }
        #prop-restriction-printable,
        #prop-restriction-printable * { visibility: visible !important; }
        #prop-restriction-printable {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0.55in 0.65in !important;
          background: #fff !important;
          color: #000 !important;
          font-family: 'Times New Roman', Times, serif !important;
          font-size: 12pt !important;
        }
        @page {
          size: letter portrait;
          margin: 0;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById("prop-restriction-print-css")?.remove();
    };
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setGenerated(false);
    setTextOutput("");
  }

  function handleGenerate() {
    setGenerated(true);
    setTextOutput(generateTextOutput(fields));
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function handlePrint() {
    window.print();
  }

  function handleCopy() {
    if (!textOutput) return;
    navigator.clipboard.writeText(textOutput).then(() => {
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
          Fill in the fields below. The output is the exact Property Restriction Form, ready to print and post at the officer station and inmate door.
        </p>

        <div className="mb-5 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/8 px-3 py-2.5">
          <Printer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-xs text-primary/90 leading-relaxed">
            <span className="font-semibold">This output is designed to be printed as the door/officer station form.</span>{" "}
            All entered information is placed directly into the official form layout — signature lines, approval checkboxes, policy language, and Yes/No selections included.
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
              <input name="lastName" value={fields.lastName} onChange={handleChange} placeholder="e.g. Doe" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>First Name (Fake) <span className="text-destructive">*</span></label>
              <input name="firstName" value={fields.firstName} onChange={handleChange} placeholder="e.g. John" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>DC Number (Fake) <span className="text-destructive">*</span></label>
            <input name="dcNumber" value={fields.dcNumber} onChange={handleChange} placeholder="e.g. X00000" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date Restricted <span className="text-destructive">*</span></label>
              <input type="date" name="dateRestricted" value={fields.dateRestricted} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Shift <span className="text-destructive">*</span></label>
              <select name="shift" value={fields.shift} onChange={handleChange} className={inputClass}>
                <option value="">Select shift...</option>
                {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Dorm / Assignment <span className="text-destructive">*</span></label>
            <input name="dormAssignment" value={fields.dormAssignment} onChange={handleChange} placeholder="e.g. D2, CM-I, G-Dorm" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Reason for Restriction <span className="text-destructive">*</span></label>
            <textarea name="reasonForRestriction" value={fields.reasonForRestriction} onChange={handleChange} rows={3}
              placeholder="e.g. Inmate refused to comply with housing rules and posed a threat to security of the institution."
              className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Restrictions / Items Restricted <span className="text-destructive">*</span></label>
            <textarea name="itemsRestricted" value={fields.itemsRestricted} onChange={handleChange} rows={3}
              placeholder="e.g. All personal property, clothing, books, and hygiene items except state-issued items."
              className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Mattress Restricted?</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="radio" name="mattress" value="yes" checked={fields.mattress === "yes"} onChange={handleChange} className="accent-primary" /> Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="radio" name="mattress" value="no" checked={fields.mattress === "no"} onChange={handleChange} className="accent-primary" /> No
                </label>
              </div>
            </div>
            <div>
              <label className={labelClass}>Bedding / Linens Restricted?</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="radio" name="bedding" value="yes" checked={fields.bedding === "yes"} onChange={handleChange} className="accent-primary" /> Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="radio" name="bedding" value="no" checked={fields.bedding === "no"} onChange={handleChange} className="accent-primary" /> No
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Shift Supervisor Name <span className="text-destructive">*</span></label>
              <input name="supervisorName" value={fields.supervisorName} onChange={handleChange} placeholder="e.g. R. Holmes" className={inputClass} />
              <p className="mt-1 text-[11px] text-amber-400/80">Enter name only, no title. Example: R. Holmes</p>
            </div>
            <div>
              <label className={labelClass}>Chief / Colonel Approval Name <span className="text-destructive">*</span></label>
              <input name="chiefName" value={fields.chiefName} onChange={handleChange} placeholder="e.g. T. Davis" className={inputClass} />
              <p className="mt-1 text-[11px] text-amber-400/80">Enter name only, no title. Example: T. Davis</p>
            </div>
          </div>

          <div>
            <label className={labelClass}>Approved or Denied <span className="text-destructive">*</span></label>
            <div className="flex gap-6 mt-1">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="radio" name="approvalStatus" value="approved" checked={fields.approvalStatus === "approved"} onChange={handleChange} className="accent-primary" /> Approved
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="radio" name="approvalStatus" value="denied" checked={fields.approvalStatus === "denied"} onChange={handleChange} className="accent-primary" /> Denied
              </label>
            </div>
          </div>

          <div>
            <label className={labelClass}>Minimum Restriction Until Date <span className="text-destructive">*</span></label>
            <input type="date" name="restrictionUntil" value={fields.restrictionUntil} onChange={handleChange} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>
              Comments / Narrative{" "}
              <span className="text-[10px] normal-case tracking-normal font-normal text-muted-foreground/60">(optional)</span>
            </label>
            <textarea name="comments" value={fields.comments} onChange={handleChange} rows={3}
              placeholder="Any additional comments or narrative notes..." className={inputClass} />
          </div>

          <div className="border-t border-border/40 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Items Returned <span className="normal-case tracking-normal font-normal">(complete when property is returned)</span>
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Date Returned</label>
                <input type="date" name="itemsReturnedDate" value={fields.itemsReturnedDate} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Shift Returned</label>
                <select name="itemsReturnedShift" value={fields.itemsReturnedShift} onChange={handleChange} className={inputClass}>
                  <option value="">Select shift...</option>
                  {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>OIC</label>
                <input name="oic" value={fields.oic} onChange={handleChange} placeholder="e.g. M. Johnson" className={inputClass} />
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

        {generated && (
          <div ref={formRef} className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground">Completed Form — Ready to Print / Save</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This is the exact form for the officer station and inmate door.
                </p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print / Save as PDF
                </button>
                <button
                  onClick={() => setShowText((v) => !v)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
                >
                  {showText ? "Hide Text" : "Copy Text"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border-2 border-primary/25 bg-white shadow-lg overflow-auto">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2 bg-gray-50 rounded-t-xl">
                <FileDown className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  Property Restriction Form — Print Preview
                </span>
              </div>
              <div className="overflow-x-auto">
                <PrintableForm fields={fields} />
              </div>
            </div>

            {showText && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">Plain text version (paste into any document)</span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
                  >
                    {copied ? <><Check className="h-3.5 w-3.5 text-green-400" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy Text</>}
                  </button>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground font-mono">
                    {textOutput}
                  </pre>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Print / Save as PDF
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
