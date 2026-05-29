import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ShieldAlert, AlertTriangle, Download } from "lucide-react";

const SHIFTS = ["Day Shift (6a–2p)", "Evening Shift (2p–10p)", "Night Shift (10p–6a)"];
const SHIFT_SHORT: Record<string, string> = {
  "Day Shift (6a–2p)": "1st",
  "Evening Shift (2p–10p)": "2nd",
  "Night Shift (10p–6a)": "3rd",
};

const RANK_DISPLAY: Record<string, string> = {
  sergeant: "Sergeant", sgt: "Sergeant",
  lieutenant: "Lieutenant", lt: "Lieutenant",
  captain: "Captain", cpt: "Captain", caption: "Captain",
  officer: "Officer", ofc: "Officer",
  colonel: "Colonel", col: "Colonel",
  corporal: "Corporal", cpl: "Corporal",
  major: "Major",
};

const REASON_TEMPLATE =
  "I, {supervisorFull}, was conducting a cell search/security inspection of {location} at approximately {time}. " +
  "During the search/inspection, Inmate {lastName}, {firstName}, DC# {dcNumber}, was found to be in possession of " +
  "multiple torn state clothing items, cardboard, string, and/or other items that could be used for fishing, " +
  "property misuse, or other security concerns. Due to the nature of the items located and the related security " +
  "concern, property restriction was initiated. " +
  "Per FAC Chapter 33-602.220 and FAC Chapter 33-602.222, if items of clothing, bedding, or property are removed " +
  "for security-related reasons, staff shall reassess the need for continued restriction every 72 hours thereafter. " +
  "The Warden, based on that assessment, will make the final determination regarding the continued denial or return " +
  "of the restricted items. The items will be returned when no further behavior, or threat of behavior, of the type " +
  "that led to the restriction has occurred.";

function formatDate(val: string) {
  if (!val) return "";
  const d = new Date(val + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function formatSupervisorName(raw: string): string {
  if (!raw.trim()) return "";
  let name = raw.trim().replace(/^(sergeant|sgt\.?|lieutenant|lt\.?|captain|cpt\.?|caption|officer|ofc\.?|sso\.?|colonel|col\.?|major|corporal|cpl\.?)\s*/i, "").trim();
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

function formatSupervisorNameFull(raw: string): string {
  if (!raw.trim()) return "";
  const m = raw.trim().match(/^(sergeant|sgt\.?|lieutenant|lt\.?|captain|cpt\.?|caption|officer|ofc\.?|colonel|col\.?|corporal|cpl\.?|major)\s*/i);
  if (m) {
    const key = m[1].toLowerCase().replace(/\.$/, "");
    const rank = RANK_DISPLAY[key] || m[1];
    return `${rank} ${formatSupervisorName(raw)}`;
  }
  return formatSupervisorName(raw);
}

function buildReasonText(fields: {
  supervisorName: string; lastName: string; firstName: string; dcNumber: string;
  searchLocation: string; searchTime: string;
}): string {
  const supervisorFull = formatSupervisorNameFull(fields.supervisorName) || "[STAFF RANK AND NAME]";
  const last     = fields.lastName.trim().toUpperCase()  || "[INMATE LAST NAME]";
  const first    = fields.firstName.trim().toUpperCase() || "[INMATE FIRST NAME]";
  const dc       = fields.dcNumber.trim().toUpperCase()  || "[DC NUMBER]";
  const location = fields.searchLocation.trim() || "[LOCATION]";
  const time     = fields.searchTime.trim()     || "[TIME]";
  return REASON_TEMPLATE
    .replace("{supervisorFull}", supervisorFull)
    .replace("{location}",       location)
    .replace("{time}",           time)
    .replace("{lastName}",       last)
    .replace("{firstName}",      first)
    .replace("{dcNumber}",       dc);
}

const defaultFields = {
  lastName: "",
  firstName: "",
  dcNumber: "",
  dateRestricted: "",
  shift: "",
  dormAssignment: "",
  searchLocation: "",
  searchTime: "",
  reasonForRestriction: "",
  supervisorName: "",
  chiefName: "",
  approvalStatus: "approved",
  restrictionUntil: "",
  itemsReturnedDate: "",
  itemsReturnedShift: "",
  oic: "",
  comments: "",
  itemsRestricted: "All state property and state-issued clothing.",
  mattress: "no",
  bedding: "no",
};

function buildTemplateData(fields: typeof defaultFields) {
  const last           = fields.lastName.trim().toUpperCase();
  const first          = fields.firstName.trim().toUpperCase();
  const dcNum          = fields.dcNumber.trim().toUpperCase();
  const supervisorFull = formatSupervisorNameFull(fields.supervisorName);
  const dateRestricted = formatDate(fields.dateRestricted);
  const restrictionUntil = formatDate(fields.restrictionUntil);
  const shift          = SHIFT_SHORT[fields.shift] || fields.shift;
  const mattressYes    = fields.mattress === "yes";
  const beddingYes     = fields.bedding  === "yes";
  const retDate  = fields.itemsReturnedDate  ? formatDate(fields.itemsReturnedDate)  : "";
  const retShift = fields.itemsReturnedShift
    ? (SHIFT_SHORT[fields.itemsReturnedShift] || fields.itemsReturnedShift) : "";
  const retOIC   = fields.oic.trim() ? formatSupervisorName(fields.oic) : "";
  return {
    L:      last,
    F:      first,
    DC:     dcNum,
    DATE:   dateRestricted,
    SHIFT:  shift,
    DORM:   fields.dormAssignment.trim(),
    STAFF:  supervisorFull,
    LOC:    fields.searchLocation.trim(),
    TIME:   fields.searchTime.trim(),
    REST:   fields.itemsRestricted.trim(),
    SUP:    supervisorFull,
    SDATE:  dateRestricted,
    CHIEF:  fields.chiefName.trim(),
    ADATE:  dateRestricted,
    A:      fields.approvalStatus === "approved" ? "X" : "",
    D:      fields.approvalStatus === "denied"   ? "X" : "",
    UNTIL:  restrictionUntil,
    MY:     mattressYes ? "X" : "",
    MN:     mattressYes ? "" : "X",
    BY:     beddingYes  ? "X" : "",
    BN:     beddingYes  ? "" : "X",
    RID:    retDate,
    RSHIFT: retShift,
    ROIC:   retOIC,
    COM:    fields.comments.trim(),
  };
}

export default function PropertyRestriction() {
  const [, navigate] = useLocation();
  const [fields, setFields] = useState(() => ({
    ...defaultFields,
    reasonForRestriction: buildReasonText(defaultFields),
  }));
  const [reasonEdited, setReasonEdited] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFields((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "reasonForRestriction") {
        setReasonEdited(true);
      } else if (!reasonEdited) {
        next.reasonForRestriction = buildReasonText(next);
      }
      return next;
    });
  }

  function resetReason() {
    setReasonEdited(false);
    setFields((prev) => ({ ...prev, reasonForRestriction: buildReasonText(prev) }));
  }

  async function handleDownloadWord() {
    setDownloading(true);
    setDownloadError("");
    try {
      const { default: PizZip } = await import("pizzip");
      const url = `${import.meta.env.BASE_URL}property-restriction-template.docx?v=${Date.now()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Template not found (${resp.status})`);
      const buf = await resp.arrayBuffer();
      const zip = new PizZip(buf);
      let xml = zip.files["word/document.xml"].asText();

      const data = buildTemplateData(fields);

      function escXml(s: string) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }

      for (const [key, val] of Object.entries(data)) {
        xml = xml.split(`{{${key}}}`).join(escXml(val));
      }

      zip.file("word/document.xml", xml);
      const blob = zip.generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      const last  = fields.lastName.trim().toUpperCase()  || "INMATE";
      const dcNum = fields.dcNumber.trim().toUpperCase() || "DC";
      a.download = `Property_Restriction_${last}_${dcNum}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);
    } catch (err) {
      console.error("Word download error:", err);
      setDownloadError(String(err));
    } finally {
      setDownloading(false);
    }
  }

  const canDownload =
    fields.lastName &&
    fields.firstName &&
    fields.dcNumber &&
    fields.dateRestricted &&
    fields.shift &&
    fields.dormAssignment &&
    fields.searchLocation &&
    fields.searchTime &&
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
        <p className="text-sm text-muted-foreground mb-5">
          Fill in the fields below, then click Download. The completed Word document is generated
          from the uploaded template — open the downloaded .docx to print or save the official form.
        </p>

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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Search Location <span className="text-destructive">*</span></label>
              <input name="searchLocation" value={fields.searchLocation} onChange={handleChange}
                placeholder="e.g. B1-202" className={inputClass} />
              <p className="mt-1 text-[10px] text-muted-foreground/60">Cell/dorm area searched — goes in reason text.</p>
            </div>
            <div>
              <label className={labelClass}>Search Time <span className="text-destructive">*</span></label>
              <input name="searchTime" value={fields.searchTime} onChange={handleChange}
                placeholder="e.g. 1:00 pm" className={inputClass} />
              <p className="mt-1 text-[10px] text-muted-foreground/60">Time of search — goes in reason text.</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass}>Reason for Restriction</label>
              {reasonEdited && (
                <button
                  type="button"
                  onClick={resetReason}
                  className="text-[10px] text-primary/70 hover:text-primary underline"
                >
                  Reset to default template
                </button>
              )}
            </div>
            <textarea
              name="reasonForRestriction"
              value={fields.reasonForRestriction}
              onChange={handleChange}
              rows={6}
              className={inputClass}
            />
            <p className="mt-1 text-[10px] text-muted-foreground/60 leading-relaxed">
              Reference only — auto-fills from supervisor, inmate name, and DC#. You can edit it manually.
            </p>
          </div>

          <div>
            <label className={labelClass}>Restrictions / Items Restricted <span className="text-destructive">*</span></label>
            <textarea name="itemsRestricted" value={fields.itemsRestricted} onChange={handleChange} rows={3}
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
              <input name="supervisorName" value={fields.supervisorName} onChange={handleChange}
                placeholder="e.g. Sergeant S. Wildman" className={inputClass} />
              <p className="mt-1 text-[11px] text-amber-400/80">Include rank. Example: Sergeant S. Wildman</p>
            </div>
            <div>
              <label className={labelClass}>Chief / Colonel Approval Name <span className="text-destructive">*</span></label>
              <input name="chiefName" value={fields.chiefName} onChange={handleChange} placeholder="e.g. T. Hawkins" className={inputClass} />
              <p className="mt-1 text-[11px] text-amber-400/80">Name only. Example: T. Hawkins</p>
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
              Comments{" "}
              <span className="text-[10px] normal-case tracking-normal font-normal text-muted-foreground/60">(optional)</span>
            </label>
            <textarea name="comments" value={fields.comments} onChange={handleChange} rows={3}
              placeholder="Any additional comments..." className={inputClass} />
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

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleDownloadWord}
            disabled={!canDownload || downloading}
            className={[
              "w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-150",
              canDownload && !downloading
                ? "bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            ].join(" ")}
          >
            <Download className="h-4 w-4" />
            {downloading ? "Preparing Download…" : "Download Completed Word Form"}
          </button>

          {downloadError && (
            <p className="text-xs text-red-400 text-center">Error: {downloadError}</p>
          )}
          {!canDownload && (
            <p className="text-center text-xs text-muted-foreground/60">
              Fill in all required fields (*) to download.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
