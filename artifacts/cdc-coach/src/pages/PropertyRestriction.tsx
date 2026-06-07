import { useState } from "react";
import { ShieldAlert, AlertTriangle, Download } from "lucide-react";
import PizZip from "pizzip";
import PageShell, { hudPanel, hudInput, hudLabel } from "@/components/PageShell";

const SHIFTS = [
  "First Shift: 12:00am - 8:30am",
  "Second Shift: 8:00am - 4:30pm",
  "Third Shift: 4:00pm - 12:30am",
];
const SHIFT_SHORT: Record<string, string> = {
  "First Shift: 12:00am - 8:30am":  "1st",
  "Second Shift: 8:00am - 4:30pm":  "2nd",
  "Third Shift: 4:00pm - 12:30am":  "3rd",
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

function addOneDayToDateInput(val: string): string {
  if (!val) return "";
  const d = new Date(val + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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
  const supervisorFull = formatSupervisorNameFull(fields.supervisorName) || "[EMPLOYEE NAME]";
  const last     = fields.lastName.trim().toUpperCase()  || "[INMATE LAST NAME]";
  const first    = fields.firstName.trim().toUpperCase() || "[INMATE FIRST NAME]";
  const dc       = fields.dcNumber.trim().toUpperCase()  || "[DC NUMBER]";
  const location = fields.searchLocation.trim() || "[SEARCH LOCATION]";
  const time     = fields.searchTime.trim()     || "[SEARCH TIME]";
  return REASON_TEMPLATE
    .replace("{supervisorFull}", supervisorFull)
    .replace("{location}",       location)
    .replace("{time}",           time)
    .replace("{lastName}",       last)
    .replace("{firstName}",      first)
    .replace("{dcNumber}",       dc);
}

const defaultFields = {
  lastName:             "",
  firstName:            "",
  dcNumber:             "",
  dateRestricted:       "",
  shift:                "",
  searchLocation:       "",
  searchTime:           "",
  reasonForRestriction: "",
  itemsRestricted:      "All state property and state-issued clothing.",
  supervisorName:       "",
  shiftSupervisorName:  "",
  chiefName:            "",
  approvalStatus:       "approved",
  restrictionUntil:     "",
  comments:             "",
  mattress:             "no",
  bedding:              "no",
};

function buildTemplateData(fields: typeof defaultFields) {
  const last               = fields.lastName.trim().toUpperCase();
  const first              = fields.firstName.trim().toUpperCase();
  const dcNum              = fields.dcNumber.trim().toUpperCase();
  const shiftSupervisorFull = formatSupervisorNameFull(fields.shiftSupervisorName);
  const dateRestricted     = formatDate(fields.dateRestricted);
  const restrictionUntil   = formatDate(fields.restrictionUntil);
  const shift              = SHIFT_SHORT[fields.shift] || fields.shift;
  const mattressYes        = fields.mattress === "yes";
  const beddingYes         = fields.bedding  === "yes";
  const employeeFull = formatSupervisorNameFull(fields.supervisorName);
  return {
    L:      last,
    F:      first,
    DC:     dcNum,
    DATE:   dateRestricted,
    SHIFT:  shift,
    DORM:   fields.searchLocation.trim(),
    EMPLOYEE_NAME:         employeeFull,
    LOC:    fields.searchLocation.trim(),
    TIME:   fields.searchTime.trim(),
    REST:   fields.itemsRestricted.trim(),
    SHIFT_SUPERVISOR_NAME: shiftSupervisorFull,
    SDATE:  dateRestricted,
    CHIEF_COLONEL_NAME:    fields.chiefName.trim(),
    ADATE:  dateRestricted,
    A:      fields.approvalStatus === "approved" ? "X" : "",
    D:      fields.approvalStatus === "denied"   ? "X" : "",
    UNTIL:  restrictionUntil,
    MY:     mattressYes ? "X" : "",
    MN:     mattressYes ? "" : "X",
    BY:     beddingYes  ? "X" : "",
    BN:     beddingYes  ? "" : "X",
    RID:    "",
    RSHIFT: "",
    ROIC:   "",
    COM:    fields.comments.trim(),
  };
}

export default function PropertyRestriction() {
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

      if (name === "dateRestricted") {
        next.restrictionUntil = addOneDayToDateInput(value);
      }

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
      const last  = fields.lastName.trim().toUpperCase() || "INMATE";
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
    fields.searchLocation &&
    fields.searchTime &&
    fields.itemsRestricted &&
    fields.supervisorName &&
    fields.shiftSupervisorName &&
    fields.chiefName &&
    fields.restrictionUntil;

  const labelClass = hudLabel;
  const inputClass = hudInput;

  return (
    <PageShell
      title="Strip / Property Restriction"
      icon={ShieldAlert}
      subtitle="Fill in the fields below, then click Download. The completed Word document is generated from the uploaded template — open the downloaded .docx to print or save the official form."
    >
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-400/70 bg-[rgba(28,18,2,0.72)] backdrop-blur-md px-4 py-3"
        style={{ boxShadow: "0 0 20px rgba(245,158,11,0.18)" }}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-sm text-amber-200/80 leading-relaxed">
          <span className="font-semibold text-amber-300">Training Sandbox Mode:</span> Use fake
          names, fake DC numbers, and fake information only. Never enter real inmate data, real DC
          numbers, or any restricted information.
        </p>
      </div>

      <div className={`${hudPanel} p-6 space-y-5`}>

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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Search Location <span className="text-destructive">*</span></label>
              <input name="searchLocation" value={fields.searchLocation} onChange={handleChange}
                placeholder="e.g. B1-202" className={inputClass} />
              <p className="mt-1 text-[10px] text-muted-foreground/60">Cell/area searched — fills description and dorm/assignment on form.</p>
            </div>
            <div>
              <label className={labelClass}>Search Time <span className="text-destructive">*</span></label>
              <input name="searchTime" value={fields.searchTime} onChange={handleChange}
                placeholder="e.g. 1:00 pm" className={inputClass} />
              <p className="mt-1 text-[10px] text-muted-foreground/60">Time of search — goes in description.</p>
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
              Reference only — auto-fills from employee name, inmate name, and DC#. You can edit it manually.
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

          <div>
            <label className={labelClass}>Employee Name <span className="text-destructive">*</span></label>
            <input name="supervisorName" value={fields.supervisorName} onChange={handleChange}
              placeholder="e.g. Sergeant S. Wildman" className={inputClass} />
            <p className="mt-1 text-[10px] text-muted-foreground/60">Fills the Reason for Restriction paragraph only. Include rank. Example: Sergeant S. Wildman</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Shift Supervisor Name <span className="text-destructive">*</span></label>
              <input name="shiftSupervisorName" value={fields.shiftSupervisorName} onChange={handleChange}
                placeholder="e.g. Captain A. Zavelghorba" className={inputClass} />
              <p className="mt-1 text-[10px] text-muted-foreground/60">Fills the Shift Supervisor signature line. Include rank.</p>
            </div>
            <div>
              <label className={labelClass}>Chief / Colonel Approval Name <span className="text-destructive">*</span></label>
              <input name="chiefName" value={fields.chiefName} onChange={handleChange} placeholder="e.g. T. Hawkins" className={inputClass} />
              <p className="mt-1 text-[10px] text-muted-foreground/60">Fills the Correctional Officer Chief line. Name only.</p>
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
            <p className="mt-1 text-[10px] text-muted-foreground/60">Auto-set to 24 hours after Date Restricted. You can change it if needed.</p>
          </div>

          <div>
            <label className={labelClass}>
              Comments{" "}
              <span className="text-[10px] normal-case tracking-normal font-normal text-muted-foreground/60">(optional)</span>
            </label>
            <textarea name="comments" value={fields.comments} onChange={handleChange} rows={3}
              placeholder="Any additional comments..." className={inputClass} />
          </div>

      </div>

      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={handleDownloadWord}
          disabled={!canDownload || downloading}
          className={[
            "w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] transition-all duration-150",
            canDownload && !downloading
              ? "border border-blue-300/50 bg-blue-600/85 text-white hover:bg-blue-500 cursor-pointer"
              : "border border-blue-400/15 bg-[rgba(4,11,34,0.6)] text-blue-300/40 cursor-not-allowed",
          ].join(" ")}
          style={canDownload && !downloading ? { boxShadow: "0 0 20px rgba(37,99,235,0.35)" } : undefined}
        >
          <Download className="h-4 w-4" />
          {downloading ? "Preparing Download…" : "Download Completed Word Form"}
        </button>

        {downloadError && (
          <p className="text-xs text-red-400 text-center">Error: {downloadError}</p>
        )}
        {!canDownload && (
          <p className="text-center text-xs text-blue-300/45">
            Fill in all required fields (*) to download.
          </p>
        )}
      </div>
    </PageShell>
  );
}
