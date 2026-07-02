import { useState } from "react";
import { FileText, ShieldCheck, AlertTriangle, CheckCircle2, Copy, Download } from "lucide-react";
import PageShell, { hudPanel, hudInput, hudLabel } from "@/components/PageShell";
import type {
  IntakeFacts6_1,
  EvaluationResult6_1,
  OutputSchema6_1,
} from "@workspace/dr-writer/types";

// ─── Exact privacy notice wording (approved, do not edit) ────────────────────
const PRIVACY_NOTICE =
  "This tool sends the facts you enter to Anthropic's Claude API to generate the report narrative. Under Anthropic's API terms, this data is not used to train their models and is retained only briefly for abuse-detection purposes, not stored long-term. This is different from Anthropic's consumer chatbot, which has separate data handling. Review the draft carefully before submitting — you are responsible for the accuracy of the final report.";

// ─── Static-form phrase maps (mirror the original intake builders) ───────────
const LOCATION_CATEGORY_PHRASES: Record<string, string> = {
  cell_door: "the cell door",
  inside_cell: "the cell",
  dayroom: "the dayroom",
  shower: "the shower area",
  movement: "the hallway",
  rec_yard: "the recreation yard",
  medical: "the medical unit",
  dining: "the dining hall",
};

const LOCATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "cell_door", label: "At the cell door" },
  { value: "inside_cell", label: "Inside the cell" },
  { value: "dayroom", label: "In the dayroom" },
  { value: "shower", label: "In the shower area" },
  { value: "movement", label: "During movement / hallway" },
  { value: "rec_yard", label: "On the recreation yard" },
  { value: "medical", label: "In the medical unit" },
  { value: "dining", label: "In the dining hall" },
  { value: "other", label: "Somewhere else" },
];

const RANKS = ["Officer", "Sergeant", "Lieutenant", "Captain", "Major", "Colonel", "Other"];

const REFERENCE_STYLES: Array<{ value: string; label: string }> = [
  { value: "he/him", label: "He / him" },
  { value: "she/her", label: "She / her" },
  { value: "they/them", label: "They / them" },
  { value: "last-name-only", label: "Last name only" },
];

const ORDER_TYPES: Array<{ value: string; label: string }> = [
  { value: "verbal", label: "Verbal" },
  { value: "written", label: "Written" },
  { value: "both", label: "Both" },
];

const ACK_TYPES: Array<{ value: string; label: string }> = [
  { value: "eye_contact", label: "Made eye contact" },
  { value: "verbal_response", label: "Gave a verbal response" },
  { value: "eye_contact_and_verbal_response", label: "Eye contact and a verbal response" },
  { value: "physical_reaction", label: "Physical reaction (turned, gestured, etc.)" },
  { value: "actions_showed_awareness", label: "Actions showed they were aware" },
  { value: "within_hearing_distance", label: "Was within hearing distance" },
];

const IMPACT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "temporarily interrupting the master roster count", label: "Interrupted the count" },
  { value: "delaying inmate movement", label: "Delayed inmate movement" },
  { value: "delaying shower operations", label: "Delayed shower operations" },
  { value: "delaying a scheduled medical or security procedure", label: "Delayed a medical or security procedure" },
  { value: "drawing the attention of surrounding inmates", label: "Drew attention of other inmates" },
  { value: "creating a security concern", label: "Created a security concern" },
  { value: "requiring staff attention away from other duties", label: "Pulled staff from other duties" },
];

// ─── Local UI form model (composite fields resolve into IntakeFacts on submit) ─
type FormState = {
  incident_date: string;
  incident_time: string;
  dorm_area: string;
  location_type: string;
  location_other: string;
  location_specific: string;
  officer_rank: string;
  officer_name: string;
  officer_post: string;
  officer_activity: string;
  inmate_last_name: string;
  inmate_first_name: string;
  dc_number: string;
  narrative_reference_style: string;
  inmate_behavior_before_order: string;
  order_type: string;
  exact_order: string;
  total_orders_given: string;
  acknowledgment_type: string;
  said_choice: string; // "said_something" | "said_nothing"
  inmate_quote: string;
  quote_is_summary: boolean;
  inmate_tone: string;
  physical_behavior: string;
  impact_checks: string[];
  impact_other_check: boolean;
  operational_impact_other: string;
  ability_to_comply: string;
  ability_to_comply_explanation: string;
  force_used: string;
  force_explanation: string;
  uof_documentation_status: string;
  confinement_status: string;
  oic_rank: string;
  oic_last_name: string;
  oic_authorized_confirmed: boolean;
  witness_present: string;
  witness_staff: string;
  camera_present: string;
  camera_id: string;
  additional_facts: string;
  separate_conduct_described: string; // "true" | "false" | ""
  separate_conduct_isolatable: string; // "true" | "false" | ""
};

const INITIAL: FormState = {
  incident_date: "",
  incident_time: "",
  dorm_area: "",
  location_type: "",
  location_other: "",
  location_specific: "",
  officer_rank: "",
  officer_name: "",
  officer_post: "",
  officer_activity: "",
  inmate_last_name: "",
  inmate_first_name: "",
  dc_number: "",
  narrative_reference_style: "",
  inmate_behavior_before_order: "",
  order_type: "",
  exact_order: "",
  total_orders_given: "",
  acknowledgment_type: "",
  said_choice: "",
  inmate_quote: "",
  quote_is_summary: false,
  inmate_tone: "",
  physical_behavior: "",
  impact_checks: [],
  impact_other_check: false,
  operational_impact_other: "",
  ability_to_comply: "",
  ability_to_comply_explanation: "",
  force_used: "",
  force_explanation: "",
  uof_documentation_status: "",
  confinement_status: "",
  oic_rank: "",
  oic_last_name: "",
  oic_authorized_confirmed: false,
  witness_present: "",
  witness_staff: "",
  camera_present: "",
  camera_id: "",
  additional_facts: "",
  separate_conduct_described: "",
  separate_conduct_isolatable: "",
};

const nullIfEmpty = (v: string): string | null => (v.trim() === "" ? null : v.trim());

function buildIncidentLocation(f: FormState): string | null {
  const specific = f.location_specific.trim();
  if (specific) return specific;
  if (!f.location_type) return null;
  if (f.location_type === "other") return nullIfEmpty(f.location_other);
  return LOCATION_CATEGORY_PHRASES[f.location_type] ?? null;
}

function buildOperationalImpact(f: FormState): string | null {
  const parts = [...f.impact_checks];
  if (f.impact_other_check && f.operational_impact_other.trim()) {
    parts.push(f.operational_impact_other.trim());
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function buildWitnessStaff(f: FormState): string | null {
  if (f.witness_present !== "yes") return null;
  return nullIfEmpty(f.witness_staff);
}

function buildCameraCoverage(f: FormState): string | null {
  if (f.camera_present !== "yes") return null;
  const idText = f.camera_id.trim();
  if (!idText) return "camera coverage";
  return /^view of/i.test(idText) ? idText : `view of ${idText}`;
}

function collectIntakeFacts(f: FormState): IntakeFacts6_1 {
  const totalRaw = f.total_orders_given.trim();
  let totalOrders: number | string | null = null;
  if (totalRaw) {
    const n = parseInt(totalRaw, 10);
    totalOrders = Number.isNaN(n) ? totalRaw : n;
  }
  const saidNothing = f.said_choice === "said_nothing";
  return {
    incident_date: nullIfEmpty(f.incident_date),
    incident_time: nullIfEmpty(f.incident_time),
    dorm_area: nullIfEmpty(f.dorm_area),
    incident_location: buildIncidentLocation(f),
    officer_rank: nullIfEmpty(f.officer_rank),
    officer_name: nullIfEmpty(f.officer_name),
    officer_post: nullIfEmpty(f.officer_post),
    officer_activity: nullIfEmpty(f.officer_activity),
    inmate_last_name: nullIfEmpty(f.inmate_last_name),
    inmate_first_name: nullIfEmpty(f.inmate_first_name),
    dc_number: nullIfEmpty(f.dc_number),
    narrative_reference_style: (nullIfEmpty(f.narrative_reference_style) as IntakeFacts6_1["narrative_reference_style"]),
    inmate_behavior_before_order: nullIfEmpty(f.inmate_behavior_before_order),
    order_type: (nullIfEmpty(f.order_type) as IntakeFacts6_1["order_type"]),
    exact_order: nullIfEmpty(f.exact_order),
    total_orders_given: totalOrders,
    acknowledgment_type: (nullIfEmpty(f.acknowledgment_type) as IntakeFacts6_1["acknowledgment_type"]),
    inmate_said_nothing: saidNothing,
    inmate_quote: saidNothing ? null : nullIfEmpty(f.inmate_quote),
    quote_is_summary: f.quote_is_summary,
    inmate_tone: nullIfEmpty(f.inmate_tone),
    physical_behavior: nullIfEmpty(f.physical_behavior),
    operational_impact: buildOperationalImpact(f),
    ability_to_comply: (nullIfEmpty(f.ability_to_comply) as IntakeFacts6_1["ability_to_comply"]),
    ability_to_comply_explanation: nullIfEmpty(f.ability_to_comply_explanation),
    force_used: (nullIfEmpty(f.force_used) as IntakeFacts6_1["force_used"]),
    force_explanation: nullIfEmpty(f.force_explanation),
    uof_documentation_status: (nullIfEmpty(f.uof_documentation_status) as IntakeFacts6_1["uof_documentation_status"]),
    confinement_status: (nullIfEmpty(f.confinement_status) as IntakeFacts6_1["confinement_status"]),
    oic_rank: nullIfEmpty(f.oic_rank),
    oic_last_name: nullIfEmpty(f.oic_last_name),
    oic_authorized_confirmed: f.oic_authorized_confirmed,
    witness_staff: buildWitnessStaff(f),
    camera_coverage: buildCameraCoverage(f),
    additional_facts: nullIfEmpty(f.additional_facts),
    separate_conduct_described:
      f.separate_conduct_described === "true" ? true : f.separate_conduct_described === "false" ? false : null,
    separate_conduct_isolatable:
      f.separate_conduct_isolatable === "true" ? true : f.separate_conduct_isolatable === "false" ? false : null,
    request_to_invent: false,
  };
}

// ─── Small themed field primitives ───────────────────────────────────────────
function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={hudLabel}>
        {label}
        {optional && <span className="ml-1.5 text-[9px] tracking-normal text-blue-300/40 normal-case">optional</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-snug text-blue-300/45">{hint}</p>}
    </div>
  );
}

function RadioRow<T extends { value: string; label: string }>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: T[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? "" : o.value)}
            aria-pressed={active}
            aria-label={`${name}: ${o.label}`}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              active
                ? "border-blue-300/80 bg-blue-600/30 text-blue-50"
                : "border-blue-400/30 bg-[rgba(2,8,24,0.6)] text-blue-200/70 hover:border-blue-300/60"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-blue-400/40 bg-blue-500/10 text-[11px] font-black text-blue-300">
        {n}
      </span>
      <h2 className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">{title}</h2>
    </div>
  );
}

// ─── Result rendering helpers ────────────────────────────────────────────────
function StatusPill({ status }: { status: "RED" | "YELLOW" | "GREEN" }) {
  const map = {
    RED: { cls: "border-red-400/60 bg-red-950/40 text-red-300", label: "Needs more facts" },
    YELLOW: { cls: "border-amber-400/60 bg-amber-950/40 text-amber-300", label: "Review recommended" },
    GREEN: { cls: "border-emerald-400/60 bg-emerald-950/40 text-emerald-300", label: "Ready" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${map.cls}`}>
      {status === "GREEN" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {map.label}
    </span>
  );
}

export default function DrWriter61() {
  const [f, setForm] = useState<FormState>(INITIAL);
  const [validation, setValidation] = useState<EvaluationResult6_1 | null>(null);
  const [output, setOutput] = useState<OutputSchema6_1 | null>(null);
  const [checking, setChecking] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Any field edit invalidates the check — the officer must re-check before drafting.
  function update<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setValidation(null);
    setOutput(null);
    setError(null);
  }

  function toggleImpact(v: string) {
    setForm((prev) => ({
      ...prev,
      impact_checks: prev.impact_checks.includes(v)
        ? prev.impact_checks.filter((x) => x !== v)
        : [...prev.impact_checks, v],
    }));
    setValidation(null);
    setOutput(null);
    setError(null);
  }

  async function handleCheck() {
    setChecking(true);
    setError(null);
    setOutput(null);
    try {
      const resp = await fetch("/api/dr-writer/6-1/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectIntakeFacts(f)),
      });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      setValidation((await resp.json()) as EvaluationResult6_1);
    } catch {
      setError("Could not reach the checking service. Please try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  async function handleGenerate() {
    setDrafting(true);
    setError(null);
    try {
      const resp = await fetch("/api/dr-writer/6-1/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake: collectIntakeFacts(f), mode: "live", confirmLive: true }),
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Server returned ${resp.status}`);
      }
      setOutput((await resp.json()) as OutputSchema6_1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The draft could not be generated.");
    } finally {
      setDrafting(false);
    }
  }

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(tag);
        setTimeout(() => setCopied(null), 1800);
      },
      () => setError("Copy failed — select the text and copy manually."),
    );
  }

  function exportTxt() {
    if (!output?.narrative) return;
    const blob = new Blob([output.narrative], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dr-6-1-narrative-${f.dc_number.trim() || "draft"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const section = `${hudPanel} p-5`;

  return (
    <PageShell
      title="DR Writer — Charge 6-1"
      subtitle="Draft a disciplinary report narrative for disobeying a verbal or written order (Charge 6-1). Enter the facts you observed firsthand, check them, then generate a narrative to review and certify."
      icon={FileText}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-5">
        {/* 1. Incident */}
        <div className={section}>
          <SectionTitle n={1} title="The Incident" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date it happened">
              <input type="date" className={hudInput} value={f.incident_date} onChange={(e) => update("incident_date", e.target.value)} />
            </Field>
            <Field label="Time it happened" hint="e.g. 1400 or 2:00 PM">
              <input type="text" className={hudInput} placeholder="e.g. 1400" value={f.incident_time} onChange={(e) => update("incident_time", e.target.value)} />
            </Field>
            <Field label="Dorm, wing, or area">
              <input type="text" className={hudInput} placeholder="e.g. E Dorm" value={f.dorm_area} onChange={(e) => update("dorm_area", e.target.value)} />
            </Field>
            <Field label="Specific number / identifier" optional hint="e.g. E3107">
              <input type="text" className={hudInput} placeholder="e.g. E3107" value={f.location_specific} onChange={(e) => update("location_specific", e.target.value)} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Where exactly did it happen?">
              <RadioRow name="Location" options={LOCATION_OPTIONS} value={f.location_type} onChange={(v) => update("location_type", v)} />
            </Field>
            {f.location_type === "other" && (
              <div className="mt-3">
                <input type="text" className={hudInput} placeholder="e.g. the visitation room" value={f.location_other} onChange={(e) => update("location_other", e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {/* 2. Reporting officer */}
        <div className={section}>
          <SectionTitle n={2} title="Reporting Officer" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your rank">
              <select className={hudInput} value={f.officer_rank} onChange={(e) => update("officer_rank", e.target.value)}>
                <option value="">Select rank…</option>
                {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Name on the report" hint="e.g. T. Davis">
              <input type="text" className={hudInput} placeholder="e.g. T. Davis" value={f.officer_name} onChange={(e) => update("officer_name", e.target.value)} />
            </Field>
            <Field label="Your post or assignment" hint="e.g. housing officer">
              <input type="text" className={hudInput} placeholder="e.g. housing officer" value={f.officer_post} onChange={(e) => update("officer_post", e.target.value)} />
            </Field>
            <Field label="What you were doing when it began" hint="e.g. conducting the master roster count">
              <input type="text" className={hudInput} placeholder="e.g. conducting the master roster count" value={f.officer_activity} onChange={(e) => update("officer_activity", e.target.value)} />
            </Field>
          </div>
        </div>

        {/* 3. Inmate */}
        <div className={section}>
          <SectionTitle n={3} title="Inmate" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Last name">
              <input type="text" className={hudInput} placeholder="e.g. Smith" value={f.inmate_last_name} onChange={(e) => update("inmate_last_name", e.target.value)} />
            </Field>
            <Field label="First name" optional>
              <input type="text" className={hudInput} placeholder="e.g. John" value={f.inmate_first_name} onChange={(e) => update("inmate_first_name", e.target.value)} />
            </Field>
            <Field label="DC number">
              <input type="text" className={hudInput} placeholder="e.g. A12345" value={f.dc_number} onChange={(e) => update("dc_number", e.target.value)} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="How should the inmate be referred to in the report?">
              <RadioRow name="Reference style" options={REFERENCE_STYLES} value={f.narrative_reference_style} onChange={(v) => update("narrative_reference_style", v)} />
            </Field>
          </div>
        </div>

        {/* 4. The order */}
        <div className={section}>
          <SectionTitle n={4} title="The Order" />
          <div className="space-y-4">
            <Field label="What was the inmate doing before you gave any order?" hint="e.g. standing at the cell door outside of his assigned cell">
              <textarea rows={2} className={hudInput} value={f.inmate_behavior_before_order} onChange={(e) => update("inmate_behavior_before_order", e.target.value)} />
            </Field>
            <Field label="How was the order given?">
              <RadioRow name="Order type" options={ORDER_TYPES} value={f.order_type} onChange={(v) => update("order_type", v)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What exactly did you order the inmate to do?" hint="e.g. return to his assigned cell">
                <input type="text" className={hudInput} placeholder="e.g. return to his assigned cell" value={f.exact_order} onChange={(e) => update("exact_order", e.target.value)} />
              </Field>
              <Field label="How many direct orders did you give?" hint="Enter the exact number, e.g. 3">
                <input type="text" className={hudInput} placeholder="e.g. 3" value={f.total_orders_given} onChange={(e) => update("total_orders_given", e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        {/* 5. Acknowledgment & response */}
        <div className={section}>
          <SectionTitle n={5} title="Acknowledgment & Response" />
          <div className="space-y-4">
            <Field label="What showed the inmate received your order?">
              <RadioRow name="Acknowledgment" options={ACK_TYPES} value={f.acknowledgment_type} onChange={(v) => update("acknowledgment_type", v)} />
            </Field>
            <Field label="Did the inmate say anything?">
              <RadioRow
                name="Said"
                options={[{ value: "said_something", label: "Yes — said something" }, { value: "said_nothing", label: "No — said nothing" }]}
                value={f.said_choice}
                onChange={(v) => update("said_choice", v)}
              />
            </Field>
            {f.said_choice === "said_something" && (
              <>
                <Field label="What exact words did the inmate say?" hint='e.g. "No, I ain’t doing that."'>
                  <input type="text" className={hudInput} placeholder='e.g. "No, I ain’t doing that."' value={f.inmate_quote} onChange={(e) => update("inmate_quote", e.target.value)} />
                </Field>
                <label className="flex items-start gap-2.5 text-xs text-blue-200/80">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-500" checked={f.quote_is_summary} onChange={(e) => update("quote_is_summary", e.target.checked)} />
                  <span>This is my summary of what was said, not the inmate’s exact words.</span>
                </label>
              </>
            )}
            <Field label="Tone of the inmate’s response" optional hint="e.g. loud and argumentative">
              <input type="text" className={hudInput} placeholder="e.g. loud and argumentative" value={f.inmate_tone} onChange={(e) => update("inmate_tone", e.target.value)} />
            </Field>
          </div>
        </div>

        {/* 6. After the order */}
        <div className={section}>
          <SectionTitle n={6} title="After the Order" />
          <div className="space-y-4">
            <Field label="What did the inmate do after the order?" hint="e.g. crossed his arms and remained positioned at the cell door, making no movement to comply">
              <textarea rows={2} className={hudInput} value={f.physical_behavior} onChange={(e) => update("physical_behavior", e.target.value)} />
            </Field>
            <Field label="What did the refusal disrupt?" optional>
              <div className="flex flex-wrap gap-2">
                {IMPACT_OPTIONS.map((o) => {
                  const active = f.impact_checks.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleImpact(o.value)}
                      aria-pressed={active}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        active ? "border-blue-300/80 bg-blue-600/30 text-blue-50" : "border-blue-400/30 bg-[rgba(2,8,24,0.6)] text-blue-200/70 hover:border-blue-300/60"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <label className="mt-3 flex items-center gap-2.5 text-xs text-blue-200/80">
                <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={f.impact_other_check} onChange={(e) => update("impact_other_check", e.target.checked)} />
                <span>Something else</span>
              </label>
              {f.impact_other_check && (
                <textarea rows={2} className={`${hudInput} mt-2`} placeholder="e.g. delayed the count by roughly ten minutes" value={f.operational_impact_other} onChange={(e) => update("operational_impact_other", e.target.value)} />
              )}
            </Field>
            <Field label="Was there any clear reason the inmate could not comply?">
              <RadioRow
                name="Ability to comply"
                options={[
                  { value: "no_issue", label: "No — the inmate was able to comply" },
                  { value: "issue_with_explanation", label: "Yes — there may have been a reason" },
                ]}
                value={f.ability_to_comply}
                onChange={(v) => update("ability_to_comply", v)}
              />
            </Field>
            {f.ability_to_comply === "issue_with_explanation" && (
              <Field label="Explain the possible reason" hint="e.g. The inmate appeared to be in medical distress.">
                <textarea rows={2} className={hudInput} value={f.ability_to_comply_explanation} onChange={(e) => update("ability_to_comply_explanation", e.target.value)} />
              </Field>
            )}
          </div>
        </div>

        {/* 7. Force */}
        <div className={section}>
          <SectionTitle n={7} title="Use of Force" />
          <div className="space-y-4">
            <Field label="Was any force used?">
              <RadioRow name="Force used" options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} value={f.force_used} onChange={(v) => update("force_used", v)} />
            </Field>
            {f.force_used === "yes" && (
              <>
                <Field label="Brief description of force used" hint="e.g. This officer applied a wrist-lock technique.">
                  <textarea rows={2} className={hudInput} value={f.force_explanation} onChange={(e) => update("force_explanation", e.target.value)} />
                </Field>
                <Field label="Was the separate use-of-force report completed?">
                  <RadioRow
                    name="UOF documentation"
                    options={[{ value: "completed", label: "Yes — completed" }, { value: "not_confirmed", label: "Not confirmed" }]}
                    value={f.uof_documentation_status}
                    onChange={(v) => update("uof_documentation_status", v)}
                  />
                </Field>
              </>
            )}
          </div>
        </div>

        {/* 8. Confinement & authorization */}
        <div className={section}>
          <SectionTitle n={8} title="Confinement & Authorization" />
          <div className="space-y-4">
            <Field label="What happened after the refusal?" optional>
              <RadioRow
                name="Confinement"
                options={[
                  { value: "placed", label: "Placed in confinement" },
                  { value: "remained", label: "Already in / remained in confinement" },
                  { value: "none", label: "No confinement action" },
                ]}
                value={f.confinement_status}
                onChange={(v) => update("confinement_status", v)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="OIC rank">
                <select className={hudInput} value={f.oic_rank} onChange={(e) => update("oic_rank", e.target.value)}>
                  <option value="">Select rank…</option>
                  {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="OIC last name" hint="e.g. Brown">
                <input type="text" className={hudInput} placeholder="e.g. Brown" value={f.oic_last_name} onChange={(e) => update("oic_last_name", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-start gap-2.5 text-xs text-blue-200/80">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-500" checked={f.oic_authorized_confirmed} onChange={(e) => update("oic_authorized_confirmed", e.target.checked)} />
              <span>I confirm the OIC named above specifically authorized this report.</span>
            </label>
          </div>
        </div>

        {/* 9. Witnesses, camera, extras */}
        <div className={section}>
          <SectionTitle n={9} title="Witnesses & Additional Detail" />
          <div className="space-y-4">
            <Field label="Did any other staff witness this?" optional>
              <RadioRow name="Witness present" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} value={f.witness_present} onChange={(v) => update("witness_present", v)} />
            </Field>
            {f.witness_present === "yes" && (
              <input type="text" className={hudInput} placeholder="e.g. Sergeant Johnson" value={f.witness_staff} onChange={(e) => update("witness_staff", e.target.value)} />
            )}
            <Field label="Was this within view of a camera?" optional>
              <RadioRow
                name="Camera present"
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_sure", label: "Not sure" }]}
                value={f.camera_present}
                onChange={(v) => update("camera_present", v)}
              />
            </Field>
            {f.camera_present === "yes" && (
              <input type="text" className={hudInput} placeholder="e.g. camera E3-12" value={f.camera_id} onChange={(e) => update("camera_id", e.target.value)} />
            )}
            <Field label="Anything else the draft should include?" optional hint="e.g. This incident was observed by surrounding inmates in E Dorm.">
              <textarea rows={2} className={hudInput} value={f.additional_facts} onChange={(e) => update("additional_facts", e.target.value)} />
            </Field>
            <Field label="Did this involve any conduct beyond refusing your order?" optional>
              <RadioRow
                name="Separate conduct"
                options={[{ value: "false", label: "No — only the refusal" }, { value: "true", label: "Yes — other conduct too" }]}
                value={f.separate_conduct_described}
                onChange={(v) => update("separate_conduct_described", v)}
              />
            </Field>
            {f.separate_conduct_described === "true" && (
              <Field label="Can the refusal be documented on its own, separate from that other conduct?">
                <RadioRow
                  name="Separate isolatable"
                  options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
                  value={f.separate_conduct_isolatable}
                  onChange={(v) => update("separate_conduct_isolatable", v)}
                />
              </Field>
            )}
          </div>
        </div>

        {/* Check facts */}
        <div className={section}>
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="w-full rounded-lg border border-blue-400/60 bg-blue-700/30 py-3 text-sm font-black uppercase tracking-[0.16em] text-blue-50 transition-colors hover:border-blue-300/90 hover:bg-blue-600/50 disabled:opacity-50"
          >
            {checking ? "Checking…" : validation ? "Check Facts Again" : "Check Facts"}
          </button>

          {validation && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <StatusPill status={validation.status} />
                <span className="text-[11px] text-blue-300/60">
                  {validation.status === "RED"
                    ? "Some required facts are missing — answer the questions below, then check again."
                    : validation.status === "YELLOW"
                      ? "You can generate a draft, but review the notes below first."
                      : "All required facts are present. You can generate the draft."}
                </span>
              </div>
              {validation.red_blockers.length > 0 && (
                <ul className="space-y-2">
                  {validation.red_blockers.map((b) => (
                    <li key={b.id} className="rounded-lg border border-red-400/40 bg-red-950/25 p-3">
                      <p className="text-xs font-bold text-red-200">{b.missing_fact}</p>
                      <p className="mt-1 text-[11px] text-red-100/70">{b.follow_up_question}</p>
                    </li>
                  ))}
                </ul>
              )}
              {validation.yellow_warnings.length > 0 && (
                <ul className="space-y-2">
                  {validation.yellow_warnings.map((w) => (
                    <li key={w.id} className="rounded-lg border border-amber-400/40 bg-amber-950/25 p-3">
                      <p className="text-xs font-bold text-amber-200">{w.warning}</p>
                      <p className="mt-1 text-[11px] text-amber-100/70">{w.suggested_clarification}</p>
                      {w.example_stronger_answer && (
                        <p className="mt-1 text-[11px] italic text-amber-100/50">e.g. {w.example_stronger_answer}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Privacy notice + Generate */}
        <div className={section}>
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-400/40 bg-[rgba(3,10,30,0.7)] p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
            <p className="text-[11px] leading-relaxed text-blue-200/80">{PRIVACY_NOTICE}</p>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={drafting || validation === null}
            className="w-full rounded-lg border border-emerald-400/60 bg-emerald-700/30 py-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-50 transition-colors hover:border-emerald-300/90 hover:bg-emerald-600/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {drafting ? "Drafting…" : "Generate Narrative"}
          </button>
          {validation === null && (
            <p className="mt-2 text-center text-[10px] text-blue-300/50">Check your facts first to enable drafting.</p>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-400/50 bg-red-950/30 p-3 text-xs text-red-200">{error}</div>
          )}
        </div>

        {/* Generated result */}
        {output && (
          <div className={section}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusPill status={output.status} />
                <h2 className="text-sm font-black uppercase tracking-[0.12em] text-blue-100">Draft Narrative</h2>
              </div>
              {output.narrative && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => copy(output.narrative ?? "", "draft")} className="inline-flex items-center gap-1.5 rounded-md border border-blue-400/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-200 hover:border-blue-300/70">
                    <Copy className="h-3 w-3" /> {copied === "draft" ? "Copied" : "Copy"}
                  </button>
                  <button type="button" onClick={exportTxt} className="inline-flex items-center gap-1.5 rounded-md border border-blue-400/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-200 hover:border-blue-300/70">
                    <Download className="h-3 w-3" /> .txt
                  </button>
                </div>
              )}
            </div>

            {output.status === "RED" ? (
              <ul className="space-y-2">
                {output.red_blockers.map((b) => (
                  <li key={b.id} className="rounded-lg border border-red-400/40 bg-red-950/25 p-3">
                    <p className="text-xs font-bold text-red-200">{b.missing_fact}</p>
                    <p className="mt-1 text-[11px] text-red-100/70">{b.follow_up_question}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {output.narrative && (
                  <div className="whitespace-pre-wrap rounded-lg border border-blue-400/30 bg-[rgba(2,8,24,0.72)] p-4 text-sm leading-relaxed text-blue-50">
                    {output.narrative}
                  </div>
                )}
                {output.yellow_warnings.length > 0 && (
                  <div className="mt-4">
                    <p className={hudLabel}>Review Notes</p>
                    <ul className="space-y-2">
                      {output.yellow_warnings.map((w, i) => (
                        <li key={i} className="rounded-lg border border-amber-400/40 bg-amber-950/25 p-3">
                          <p className="text-xs font-bold text-amber-200">{w.warning}</p>
                          <p className="mt-1 text-[11px] text-amber-100/70">{w.suggested_clarification}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-4">
                  <p className={hudLabel}>Officer Review Checklist</p>
                  <ul className="space-y-1.5">
                    {output.officer_review_checklist.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-blue-200/75">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-blue-400/60" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="mt-4 border-t border-blue-500/20 pt-3 text-[10px] italic leading-relaxed text-blue-300/50">{output.ai_disclosure}</p>
              </>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
