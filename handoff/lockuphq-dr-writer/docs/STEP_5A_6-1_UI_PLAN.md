# Step 5A — Charge 6-1 UI Plan

**Version:** 1.0  
**Status:** Design only — no UI implemented  
**Charge:** 6-1 — Disobeying Verbal or Written Order  
**Backend schema version:** 1.1  
**Depends on:** `docs/STEP_4H_6-1_INTAKE_FIELD_CONTRACT.md`

---

## A. Purpose

This is the first UI planning document for Charge 6-1. It answers:

> "What should the first website form look like, how should it behave, and how should it connect to the locked backend later?"

The locked backend (`evaluate6_1` → `generate6_1` → `validateAgainstLocalEvaluation`) does not change in this step. This document describes only what the UI layer will collect, display, and gate — and in what order.

The officer remains the author of every report. The UI collects their factual answers. The backend formats them. No facts are invented.

---

## B. Non-goals for this step

- No UI implementation yet. Step 5B is the first build.
- No real data. Dev/test use fake/sample data only.
- No PDF or export yet. Copy-to-clipboard is the first target.
- No login or authentication yet.
- No storage or database yet. The form is stateless.
- No other charges. This plan covers Charge 6-1 only.
- No production deployment planning yet.
- No changes to backend source, schema, or tests.

---

## C. Recommended first screen layout

The first screen is a single scrollable page with a collapsible or stepped section layout. Each section maps to one intake region in `IntakeFacts6_1`. Officers complete sections in order. A progress indicator shows how far along they are.

The page has three phases:
1. **Intake form** — officer fills answers
2. **Validation result** — RED/YELLOW/GREEN feedback, no Claude call yet
3. **Generated narrative** — shown only after officer requests generation

### Section order

```
┌─────────────────────────────────────────────────────┐
│  LOCKUPHQ DR Writer — Charge 6-1                    │
│  Disobeying Verbal or Written Order                  │
│                                                     │
│  ⚠ Dev mode — do not enter real inmate data         │
└─────────────────────────────────────────────────────┘

  Section 1  ▸ Incident Basics
  Section 2  ▸ Reporting Officer / Assignment
  Section 3  ▸ Inmate Identification
  Section 4  ▸ Location and Behavior Before Order
  Section 5  ▸ Order Details
  Section 6  ▸ Inmate Response
  Section 7  ▸ Physical Behavior After Order
  Section 8  ▸ Operational Impact
  Section 9  ▸ Ability to Comply
  Section 10 ▸ Force / Use-of-Force
  Section 11 ▸ Confinement Outcome
  Section 12 ▸ OIC Authorization
  Section 13 ▸ Optional Context
  Section 14 ▸ Separate Conduct (conditional)

  [  Validate My Answers  ]   [  Clear Form  ]

──────────── Validation result appears here ────────────

  [  Generate My Report  ]   ← enabled only after GREEN/YELLOW

──────────── Narrative appears here ────────────

  [  Copy Narrative  ]   [  Copy Full JSON  ]
```

---

## D. Field-by-field UI behavior

All 36 `IntakeFacts6_1` fields. Organized by form section.

---

### Section 1 — Incident Basics

#### `incident_date`
| Attribute | Spec |
|---|---|
| **Label** | Date of incident * |
| **Control** | Date picker or plain text input |
| **Placeholder** | `Example: March 12, 2026` |
| **Required marker** | `*` |
| **Validation** | RED if blank on submit |
| **Helper text** | What date did this incident occur? |
| **RED/YELLOW impact** | RED: `missing_incident_date` |
| **In review summary** | Yes |

#### `incident_time`
| Attribute | Spec |
|---|---|
| **Label** | Time of incident * |
| **Control** | Text input |
| **Placeholder** | `Example: 1400 or 2:00 PM` |
| **Required marker** | `*` |
| **Validation** | RED if blank. Inline warning if non-numeric descriptor is detected (e.g., "after chow"). Backend normalizes valid numeric input to `HHMM hours`. |
| **Helper text** | Use a number. "After chow" and "late evening" are not accepted — your best numeric estimate is fine. |
| **Inline hint** | Shown on blur if input matches a non-numeric descriptor pattern: "This doesn't look like a time. Please enter a number (Example: 1400 or 2:00 PM)." |
| **RED/YELLOW impact** | RED: `missing_incident_time` |
| **In review summary** | Yes |

---

### Section 2 — Reporting Officer / Assignment

#### `officer_rank`
| Attribute | Spec |
|---|---|
| **Label** | Your rank * |
| **Control** | Dropdown with "Other" free-text escape |
| **Options** | Officer, Sergeant, Lieutenant, Captain, Major, Colonel, Other |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | Select your rank as it appears in the report. |
| **RED/YELLOW impact** | RED: `missing_officer_rank` |
| **In review summary** | Yes |

#### `officer_name`
| Attribute | Spec |
|---|---|
| **Label** | Your name * |
| **Control** | Text input |
| **Placeholder** | `Example: T. Davis` |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | Enter your name as it should appear in the report. |
| **RED/YELLOW impact** | RED: `missing_officer_name` |
| **In review summary** | Yes |

#### `officer_post`
| Attribute | Spec |
|---|---|
| **Label** | Your post or assignment * |
| **Control** | Text input |
| **Placeholder** | `Example: housing officer` |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | What was your post or assignment at the time? (Example: housing officer, floor officer, wing officer) |
| **RED/YELLOW impact** | RED: `missing_officer_post` |
| **In review summary** | Yes |

#### `officer_activity`
| Attribute | Spec |
|---|---|
| **Label** | What were you doing when this incident began? * |
| **Control** | Text input |
| **Placeholder** | `Example: conducting the master roster count` |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | What was your assigned task at the moment this started — not what you did in response, but what you were doing before. |
| **RED/YELLOW impact** | RED: `missing_officer_activity` |
| **In review summary** | Yes |

---

### Section 3 — Inmate Identification

#### `inmate_last_name`
| Attribute | Spec |
|---|---|
| **Label** | Inmate last name * |
| **Control** | Text input |
| **Placeholder** | `Example: Smith` |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | Enter the inmate's last name as it appears in FDOC records. |
| **RED/YELLOW impact** | RED: `missing_inmate_identity` |
| **In review summary** | Yes |

#### `inmate_first_name`
| Attribute | Spec |
|---|---|
| **Label** | Inmate first name |
| **Control** | Text input |
| **Placeholder** | `Example: John (optional)` |
| **Required marker** | None |
| **Validation** | None — optional field |
| **Helper text** | Optional. Used in the first reference only. |
| **RED/YELLOW impact** | None |
| **In review summary** | Yes (if provided) |

#### `dc_number`
| Attribute | Spec |
|---|---|
| **Label** | Inmate DC number * |
| **Control** | Text input |
| **Placeholder** | `Example: A12345` |
| **Required marker** | `*` |
| **Validation** | RED if blank. Soft inline warning (not a hard block) if format doesn't match letter + 5 digits: "This doesn't look like a standard DC number — double-check before submitting." |
| **Helper text** | Enter the inmate's DC number exactly as it appears. |
| **RED/YELLOW impact** | RED: `missing_dc_number` |
| **In review summary** | Yes |

#### `narrative_reference_style`
| Attribute | Spec |
|---|---|
| **Label** | How should this inmate be referred to in the report? * |
| **Control** | Radio group — 4 options |
| **Options** | `he/him` — He, him, his / `she/her` — She, her, hers / `they/them` — They, them, their / `last-name-only` — "Inmate Smith" only, no pronouns |
| **Required marker** | `*` |
| **Validation** | RED if nothing selected |
| **Helper text** | This controls pronouns throughout all six paragraphs. |
| **RED/YELLOW impact** | RED: `missing_narrative_reference_style` |
| **In review summary** | Yes |

---

### Section 4 — Location and Behavior Before Order

#### `dorm_area`
| Attribute | Spec |
|---|---|
| **Label** | Dorm, wing, or area * |
| **Control** | Text input (free text for v1) |
| **Placeholder** | `Example: E Dorm` |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | The dorm, wing, or housing unit where this happened. This is used in the operational impact paragraph — not the exact location. |
| **RED/YELLOW impact** | RED: `missing_dorm_area` |
| **In review summary** | Yes |

#### `incident_location`
| Attribute | Spec |
|---|---|
| **Label** | Exact location of the incident * |
| **Control** | Text input |
| **Placeholder** | `Example: cell E3107` |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | The specific spot where the incident happened — cell number, room name, or area. This goes in paragraph 1 verbatim. |
| **RED/YELLOW impact** | RED: `missing_incident_location` |
| **In review summary** | Yes |

#### `inmate_behavior_before_order`
| Attribute | Spec |
|---|---|
| **Label** | What was the inmate doing before you gave any order? * |
| **Control** | Textarea (3 rows) |
| **Placeholder** | `Example: standing at the cell door outside of his assigned cell` |
| **Required marker** | `*` |
| **Validation** | RED if blank. YELLOW if conclusory patterns detected. |
| **Helper text** | Describe only what you could see before you said anything — the inmate's physical position, location, or action at that exact moment. Do not describe compliance or refusal here. |
| **RED/YELLOW impact** | RED: `missing_inmate_before_order` / YELLOW: `conclusory_inmate_before_order` |
| **In review summary** | Yes |

---

### Section 5 — Order Details

#### `order_type`
| Attribute | Spec |
|---|---|
| **Label** | How was the order given? * |
| **Control** | Radio group |
| **Options** | Verbal (spoken) / Written / Both |
| **Required marker** | `*` |
| **Validation** | RED if nothing selected |
| **Helper text** | Was the order you gave verbal, written, or both? |
| **RED/YELLOW impact** | RED: `missing_order_type` |
| **In review summary** | Yes |

#### `exact_order`
| Attribute | Spec |
|---|---|
| **Label** | What exactly did you order the inmate to do? * |
| **Control** | Text input |
| **Placeholder** | `Example: return to his assigned cell` |
| **Required marker** | `*` |
| **Validation** | RED if blank or single vague verb. Backend strips "I told him to…" prefix automatically. |
| **Helper text** | Write the command — not "I told him to" but what you ordered. Be specific: "stop what?" is not acceptable. |
| **RED/YELLOW impact** | RED: `missing_specific_order` |
| **In review summary** | Yes |

#### `total_orders_given`
| Attribute | Spec |
|---|---|
| **Label** | How many total orders did you give? * |
| **Control** | Number input (integer, min 1) |
| **Placeholder** | `Example: 3` |
| **Required marker** | `*` |
| **Validation** | RED if blank, 0, or vague descriptor typed. Inline hint if non-numeric entered. |
| **Helper text** | Enter the exact number — not "several" or "multiple." If you gave 3 orders, enter 3. |
| **RED/YELLOW impact** | RED: `missing_specific_order_count` |
| **In review summary** | Yes |

---

### Section 6 — Inmate Response

#### `acknowledgment_type`
| Attribute | Spec |
|---|---|
| **Label** | What showed the inmate received your order? * |
| **Control** | Radio group (6 options) |
| **Options** | Eye contact only / Verbal response only / Eye contact and verbal response / Physical reaction (turned, stepped back, etc.) / Actions showed awareness / Within hearing distance only |
| **Required marker** | `*` |
| **Validation** | RED if nothing selected |
| **Helper text** | Choose what demonstrated the inmate heard your order. "Within hearing distance only" is the weakest option and will produce a review flag. |
| **RED/YELLOW impact** | RED: `missing_acknowledgment` / YELLOW: `within_hearing_distance_only` |
| **In review summary** | Yes |

#### `inmate_quote` / `inmate_said_nothing`
These two fields are rendered as a single combined control:

| Attribute | Spec |
|---|---|
| **Label** | Did the inmate say anything? * |
| **Control** | Radio choice + conditional text input |
| **Option A** | "The inmate said: [text input for exact words]" |
| **Option B** | "The inmate said nothing" (sets `inmate_said_nothing = true`, clears `inmate_quote`) |
| **Required marker** | `*` — one option must be selected |
| **Validation** | RED: `missing_inmate_response` if neither is set. YELLOW: `quote_is_summary` if quote matches summary pattern. Selecting option A and filling quote sets `inmate_said_nothing = false` automatically. |
| **Helper text for quote** | Type the exact words — what actually came out of their mouth, as best you remember. Don't describe what they said; quote it. Profanity is preserved as reported. |
| **Helper text for said nothing** | Check this only if the inmate made no verbal response at all. |
| **RED/YELLOW impact** | RED: `missing_inmate_response` / YELLOW: `quote_is_summary` |
| **In review summary** | Yes |
| **Note** | Combining these into one control prevents the `quote_conflicts_with_said_nothing` contradiction at the form level. The YELLOW warning still exists in the backend as a safety net, but a well-designed control makes it rare. |

#### `inmate_tone`
| Attribute | Spec |
|---|---|
| **Label** | Tone of the inmate's response |
| **Control** | Text input — shown only when "The inmate said:" is selected |
| **Placeholder** | `Example: loud and argumentative` |
| **Required marker** | None (but YELLOW if inmate spoke and blank) |
| **Validation** | YELLOW: `missing_tone_when_inmate_spoke` if quote provided and tone blank |
| **Helper text** | How did it sound — loud, argumentative, sarcastic, calm but refusing? |
| **RED/YELLOW impact** | YELLOW: `missing_tone_when_inmate_spoke` |
| **In review summary** | Yes (if provided) |

---

### Section 7 — Physical Behavior After Order

#### `physical_behavior`
| Attribute | Spec |
|---|---|
| **Label** | What did the inmate physically do after you gave the order? * |
| **Control** | Textarea (3 rows) |
| **Placeholder** | `Example: crossed his arms and remained positioned at the cell door` |
| **Required marker** | `*` |
| **Validation** | RED if blank. YELLOW if conclusory patterns detected. YELLOW if duration-only. |
| **Helper text** | Describe position, movement, posture, gestures — only what you observed. Do not use "was noncompliant" or "was disrespectful." |
| **RED/YELLOW impact** | RED: `missing_physical_behavior` / YELLOW: `conclusory_physical_behavior` or `physical_behavior_duration_only` |
| **In review summary** | Yes |

---

### Section 8 — Operational Impact

#### `operational_impact`
| Attribute | Spec |
|---|---|
| **Label** | How did this incident affect your area or operation? |
| **Control** | Textarea (3 rows) |
| **Placeholder** | `Example: temporarily interrupting the master roster count and drawing the attention of surrounding inmates` |
| **Required marker** | None shown (YELLOW if vague, but not a hard RED) |
| **Validation** | YELLOW: `vague_operational_impact` if fewer than 5 words or matches vague patterns |
| **Helper text** | Describe what was interrupted, delayed, or disrupted. Reference the dorm or wing — not the cell number. Avoid "it caused problems" or "yes." |
| **RED/YELLOW impact** | YELLOW: `vague_operational_impact` |
| **In review summary** | Yes |

---

### Section 9 — Ability to Comply

#### `ability_to_comply`
| Attribute | Spec |
|---|---|
| **Label** | Did you observe anything that may have prevented the inmate from complying? * |
| **Control** | Radio group |
| **Options** | "No apparent issue" (`no_issue`) / "Yes — describe below" (`issue_with_explanation`) |
| **Required marker** | `*` |
| **Validation** | RED if nothing selected |
| **Helper text** | Was there any medical condition, mental health issue, physical limitation, or language barrier you observed? |
| **RED/YELLOW impact** | RED: `missing_ability_to_comply` |
| **In review summary** | Yes |

#### `ability_to_comply_explanation`
| Attribute | Spec |
|---|---|
| **Label** | Describe what you observed * |
| **Control** | Textarea — shown only when "Yes — describe below" is selected |
| **Placeholder** | `Example: The inmate appeared to be in medical distress.` |
| **Required marker** | `*` when visible |
| **Validation** | RED if visible and blank |
| **Helper text** | Describe what you directly observed or what was reported to you. |
| **RED/YELLOW impact** | RED: `medical_issue_no_explanation` |
| **In review summary** | Yes (if provided) |

---

### Section 10 — Force / Use-of-Force

#### `force_used`
| Attribute | Spec |
|---|---|
| **Label** | Was force used during this incident? * |
| **Control** | Radio group |
| **Options** | "Yes" / "No" |
| **Required marker** | `*` |
| **Validation** | RED if nothing selected (null is not accepted) |
| **Helper text** | Answer yes or no. Not answering blocks generation. |
| **RED/YELLOW impact** | RED: `missing_force_answer` |
| **In review summary** | Yes |

#### `force_explanation`
| Attribute | Spec |
|---|---|
| **Label** | Briefly describe the force used * |
| **Control** | Textarea — shown only when "Yes" is selected |
| **Placeholder** | `Example: This officer applied a wrist-lock technique.` |
| **Required marker** | `*` when visible |
| **Validation** | RED if visible and blank |
| **Helper text** | Brief factual summary only — this is not a UOF report. Complete the use-of-force report separately. |
| **RED/YELLOW impact** | RED: `force_no_explanation` |
| **In review summary** | Yes (if provided) |

#### `uof_documentation_status`
| Attribute | Spec |
|---|---|
| **Label** | Was a separate use-of-force report completed? |
| **Control** | Radio group — shown only when "Yes" force is selected |
| **Options** | "Yes, completed" (`completed`) / "Not yet confirmed" (`not_confirmed`) |
| **Required marker** | None (YELLOW if not confirmed) |
| **Validation** | YELLOW: `uof_documentation_not_confirmed` if `not_confirmed` |
| **Helper text** | This system only notes the UOF status — it does not generate the UOF report. |
| **RED/YELLOW impact** | YELLOW: `uof_documentation_not_confirmed` |
| **In review summary** | Yes (if force used) |
| **Note** | `not_applicable` is set automatically by the backend when `force_used = no`. The form does not need to show this option. |

---

### Section 11 — Confinement Outcome

#### `confinement_status`
| Attribute | Spec |
|---|---|
| **Label** | What happened with confinement? |
| **Control** | Radio group |
| **Options** | "Inmate was placed in administrative confinement" (`placed`) / "Inmate was already in confinement and remained" (`remained`) / "No confinement" (`none`) |
| **Required marker** | None — optional |
| **Validation** | None currently (backend omits confinement line if null). Note: `unclear_confinement_status` YELLOW is documented in KB but not yet implemented in code — see mismatch doc. |
| **Helper text** | Administrative confinement is pre-hearing placement — not a punishment. If you type "disciplinary confinement" anywhere, the system will correct it automatically. |
| **RED/YELLOW impact** | None currently (YELLOW pending implementation) |
| **In review summary** | Yes |

---

### Section 12 — OIC Authorization

#### `oic_rank`
| Attribute | Spec |
|---|---|
| **Label** | OIC rank * |
| **Control** | Dropdown with same options as officer rank |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | The rank of the shift OIC who authorized this report. |
| **RED/YELLOW impact** | RED: `missing_oic_rank` / YELLOW: `oic_incomplete` (if name missing) |
| **In review summary** | Yes |

#### `oic_last_name`
| Attribute | Spec |
|---|---|
| **Label** | OIC last name * |
| **Control** | Text input |
| **Placeholder** | `Example: Brown` |
| **Required marker** | `*` |
| **Validation** | RED if blank |
| **Helper text** | Last name of the OIC who authorized this report. |
| **RED/YELLOW impact** | RED: `missing_oic_last_name` / YELLOW: `oic_incomplete` (if rank missing) |
| **In review summary** | Yes |

---

### Section 13 — Optional Context

#### `witness_staff`
| Attribute | Spec |
|---|---|
| **Label** | Were other staff members present? |
| **Control** | Textarea |
| **Placeholder** | `Example: Sergeant Johnson and Officer Williams were present.` |
| **Required marker** | None |
| **Validation** | YELLOW: `vague_witness_information` if provided but too vague |
| **Helper text** | If other staff witnessed this, provide their rank and last name. Leave blank if none. Vague entries like "other officers" will produce a review flag. |
| **RED/YELLOW impact** | YELLOW: `vague_witness_information` |
| **In review summary** | Yes (if provided) |

#### `camera_coverage`
| Attribute | Spec |
|---|---|
| **Label** | Camera coverage |
| **Control** | Textarea |
| **Placeholder** | `Example: This incident occurred within view of camera E3-12.` |
| **Required marker** | None |
| **Validation** | None |
| **Helper text** | Optional. Note the camera location or ID if this incident was captured. Leave blank if unknown. |
| **RED/YELLOW impact** | None |
| **In review summary** | Yes (if provided) |

#### `additional_facts`
| Attribute | Spec |
|---|---|
| **Label** | Additional facts |
| **Control** | Textarea |
| **Placeholder** | `Example: This incident was observed by surrounding inmates in E Dorm.` |
| **Required marker** | None |
| **Validation** | YELLOW: `opinion_or_motive_language` if opinion patterns detected. YELLOW: `disciplinary_confinement_corrected` if "disciplinary confinement" found (auto-corrected by backend). |
| **Helper text** | Anything else relevant. Describe only what you observed — not what you believe the inmate intended. "I think" and "he was trying to" will produce a review flag. |
| **RED/YELLOW impact** | YELLOW: `opinion_or_motive_language` / `disciplinary_confinement_corrected` |
| **In review summary** | Yes (if provided) |

---

### Section 14 — Separate Conduct (conditional)

This section appears only if the officer indicates that the incident involved conduct beyond the order refusal. It is gated by a preliminary question shown after Section 13.

#### Preliminary question
> "Did this incident involve any conduct beyond the inmate refusing your order? (Example: the inmate also threatened staff, damaged property, or assaulted someone)"

- If **No** → `separate_conduct_described = false`, section hidden, `separate_conduct_isolatable = null`
- If **Yes** → `separate_conduct_described = true`, section expands

#### `separate_conduct_isolatable` (shown if Yes above)
| Attribute | Spec |
|---|---|
| **Label** | Can the 6-1 refusal be written up separately from the other conduct? |
| **Control** | Radio group |
| **Options** | "Yes — the 6-1 refusal can stand alone" (`true`) / "No — the conduct is too intertwined to separate" (`false`) |
| **Validation** | RED: `cannot_isolate_6_1` if `false`. YELLOW: `conduct_outside_6_1_can_be_isolated` if `true`. |
| **Helper text** | Can we write a 6-1 report about the order refusal alone without misrepresenting what happened? If the other conduct is too tied to the refusal, a separate DR is required for each violation. |
| **RED/YELLOW impact** | RED: `cannot_isolate_6_1` / YELLOW: `conduct_outside_6_1_can_be_isolated` |
| **In review summary** | Yes |

#### `request_to_invent` (internal — never officer-visible)
Always sent as `false`. Never rendered in the form.

---

## E. RED / YELLOW / GREEN UI behavior

### RED — No generation

When the backend returns RED:

```
┌─────────────────────────────────────────────────────────────┐
│  🚫  Your report is missing required information            │
│                                                             │
│  Answer each question below to continue.                    │
│  No narrative can be generated until all blockers are       │
│  resolved.                                                  │
└─────────────────────────────────────────────────────────────┘

  ▸ [missing_dc_number]
    Missing: DC number
    Question: What is the inmate's DC number? (Example: A12345)

  ▸ [missing_specific_order]
    Missing: Specific order
    Question: What exactly did you order the inmate to do?
              Be specific enough that compliance was clear.
              (Example: return to his assigned cell)
```

- "Generate My Report" button is disabled and grayed out.
- Each blocker links back to its field in the form.
- No Claude API call is made.

### YELLOW — Generation allowed with required review

When the backend returns YELLOW after Claude generation:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠  This report has flagged sections that need your         │
│     review before it is ready to use.                       │
│                                                             │
│  Flagged paragraphs are marked [REVIEW — ...] in the text.  │
│  Read each flagged section carefully. The AI has noted      │
│  where your answer may need clarification.                  │
└─────────────────────────────────────────────────────────────┘
```

- Narrative is shown with `[REVIEW — flag_label]` markers inline.
- Flagged paragraphs are visually highlighted (yellow background or border).
- Warning list shown beneath the banner with paragraph numbers.
- Officer must scroll through narrative before "Copy Narrative" is enabled.
- AI Disclosure and Officer Review Checklist are shown.

### GREEN — Generation allowed, review still required

When the backend returns GREEN after Claude generation:

```
┌─────────────────────────────────────────────────────────────┐
│  ✓  No flags were found. Review the narrative below and     │
│     certify before using.                                   │
│                                                             │
│  GREEN means no automatic flags — it does not mean the      │
│  report is certified. You must read and verify every        │
│  paragraph before using this report.                        │
└─────────────────────────────────────────────────────────────┘
```

- Narrative is shown with no `[REVIEW]` markers.
- AI Disclosure and Officer Review Checklist are shown.
- Officer must scroll through the narrative and work through checklist before "Copy Narrative" is enabled.

### All statuses — AI Disclosure and Checklist

Regardless of status, after narrative is shown:

```
─────────────────────────────────────────────────────────────
  AI DISCLOSURE

  This narrative was formatted with AI assistance using
  LOCKUPHQ DR Writer v1.1, Charge 6-1. All factual content
  was provided by the reporting officer. The officer has
  reviewed and certified the accuracy of this report.

─────────────────────────────────────────────────────────────
  OFFICER REVIEW CHECKLIST

  Before using this report, confirm each item below:

  ☐ The inmate's name and DC number are correct.
  ☐ The incident date and time are accurate.
  ☐ The location is the exact location where the incident occurred.
  ☐ The order you gave is documented exactly as you gave it.
  ☐ The order count is the exact number of orders you gave.
  ☐ If the inmate spoke, the quote is accurate to what was said.
  ☐ The physical behavior matches what you directly observed.
  ☐ The OIC rank and name are correct and authorized this report.
  ☐ The confinement status accurately reflects what occurred.
  ☐ No facts appear that you did not provide.
  ☐ You have read the entire narrative and it accurately
    represents your firsthand account.
  ☐ You understand that certifying this report means attesting
    to the accuracy of its contents.

  [  Copy Narrative  ]    ← enabled only after all items checked
```

---

## F. Button behavior plan

| Button | Behavior | Phase | Step |
|---|---|---|---|
| **Validate My Answers** | Runs evaluate6_1 server-side (or equivalent local call). Shows RED/YELLOW/GREEN result. No Claude call. | Intake form | Step 5B |
| **Generate My Report** | Triggers Claude API call server-side. Disabled unless validation passed (GREEN or YELLOW). Requires officer to confirm readiness. | After validation | Step 5C |
| **Clear Form** | Resets all fields to blank. Asks for confirmation before clearing. | Intake form | Step 5B |
| **Save Draft Locally** | Saves current form state to browser localStorage. No server storage. No real inmate data in dev. | Intake form | Step 5D (future) |
| **Copy Narrative** | Copies plain-text narrative to clipboard. Enabled only after checklist is complete. | After narrative | Step 5C |
| **Copy Full JSON** | Copies the full `OutputSchema6_1` JSON to clipboard. For developer/debug use only in v1. | After narrative | Step 5C |
| **Export as PDF** | Not in v1. Requires PDF infrastructure. | — | Future — Step 5E or later |
| **Submit to FDOC** | Not in scope for this module at any step. | — | Never — out of scope |

**Step 5B target buttons:** Validate My Answers, Clear Form (static mock only — no real API).  
**Step 5C target buttons:** Generate My Report, Copy Narrative, Copy Full JSON.  
**Future buttons:** Save Draft Locally, Export as PDF.

---

## G. Safety wording for the UI

Exact copy for each officer-facing safety message.

### "AI does not create facts"
> **This tool formats your report — it does not create facts.**  
> Every fact in this narrative came from your answers. The AI structures and formats them. It does not invent witnesses, quotes, evidence, locations, or inmate intent. If something appears in the narrative that you did not provide, do not use this report. Clear the form and start again.

### "Review before certifying"
> **You must review this narrative before using it.**  
> Read every paragraph. The AI formats what you told it — but you are the author and you are responsible for the accuracy of this report. Do not submit a narrative you have not read in full.

### "YELLOW warning"
> **This report has sections that need your review.**  
> Paragraphs marked `[REVIEW — ...]` contain information that may need clarification based on your answers. Read each flagged section carefully. You may edit the narrative before using it — you are the author.

### "RED blocker"
> **Your report cannot be generated yet.**  
> The questions below need answers before a narrative can be written. Each missing answer is a required element of a 6-1 disciplinary report. Answer each question and validate again.

### "No real DR uploads yet"
> **This module does not accept uploaded disciplinary reports.**  
> Answer the questions on this form using your firsthand knowledge of the incident. Do not upload or paste an existing DR into any field.

### "Do not enter real inmate data in dev mode"
> **⚠ Developer / Testing Mode**  
> This instance is running in developer mode. Do not enter real inmate names, DC numbers, or officer information. Use the provided fake sample data only. Real data must only be entered in a production-secured environment.

---

## H. First UI build recommendation — Step 5B

### What Step 5B should be

A **static mock form** with no backend connection and no API call.

**Purpose:** Layout review only. Confirm that the form section order, field controls, labels, helper text, and conditional logic are correct and usable before any backend wiring.

**What Step 5B includes:**
- All 14 form sections rendered in order
- All field controls (text inputs, textareas, radio groups, dropdowns, checkboxes)
- All labels, placeholders, and helper text
- Conditional field display logic (e.g., force explanation appears only when force = yes)
- The `inmate_quote` / `inmate_said_nothing` combined radio control
- The separate conduct conditional section
- "Validate My Answers" button that logs sample JSON to the browser console only — no API call
- "Clear Form" button that resets all fields
- A static sample validation result banner (can be toggled between RED/YELLOW/GREEN for layout review)
- A static sample narrative block showing the 6-paragraph format and `[REVIEW — ...]` markers
- A static sample officer review checklist
- Dev mode warning banner

**What Step 5B does NOT include:**
- No real API calls
- No real backend connection
- No data sent anywhere
- No real inmate data
- No persistence or localStorage
- No copy-to-clipboard functionality yet
- No PDF export

**Acceptance criteria for Step 5B:**
- Form renders correctly in a browser
- All 14 sections are visible and navigable
- Conditional fields show/hide correctly
- "Validate" button logs sample `IntakeFacts6_1` JSON to console
- No real API key used
- No real data entered during testing

---

## I. UI architecture notes (proposed — not created yet)

The following file structure is proposed for a future implementation step. **Do not create these files yet.**

```
src/
  dr-writer/
    ui/
      charge6_1/
        FormConfig6_1.ts       — field definitions, control types, section groupings
        Labels6_1.ts           — all officer-facing label and helper text strings
        ValidationCopy6_1.ts   — RED/YELLOW UI copy, blocker messages, warning messages
        SafetyCopy6_1.ts       — AI disclosure, dev mode warning, review copy
        FormState6_1.ts        — TypeScript type for form state (maps to IntakeFacts6_1)
        ConditionalLogic6_1.ts — show/hide rules for conditional fields
```

### Why separate these files

- `FormConfig6_1.ts` is the single source of truth for field order, control types, and section groupings. Changing a control type here changes it everywhere.
- `Labels6_1.ts` keeps all officer-facing strings in one place for easy review, correction, and future localization.
- `ValidationCopy6_1.ts` keeps blocker/warning messages synchronized with the backend blocker IDs. When a new blocker is added to `evaluate6_1.ts`, its UI message is added here.
- `SafetyCopy6_1.ts` keeps safety and disclosure strings versioned and reviewable separately from labels.
- `ConditionalLogic6_1.ts` isolates show/hide rules so they can be tested without rendering the full form.

### Backend connection point (future)

When the UI is wired to the backend in Step 5C:

```
FormState6_1 → serialize to IntakeFacts6_1 JSON
             → POST /api/dr-writer/6-1/validate  (returns EvaluationResult6_1)
             → POST /api/dr-writer/6-1/generate  (returns OutputSchema6_1)
```

The API must be server-side. `ANTHROPIC_API_KEY` must never appear in browser code.

---

## J. Open questions before building the UI

These must be answered or accepted as defaults before Step 5B begins.

1. **Should officer rank be a dropdown?**  
   Recommendation: Yes — dropdown with "Other" free-text escape. Prevents `sargent` / `sgt` typos. Backend normalizes anyway, but catching at entry is better UX.

2. **Should dorm/area be free text or a dropdown?**  
   Recommendation: Free text for v1. Dropdowns require a facility list that doesn't exist yet. Add per-facility dropdowns in a later release.

3. **Should DC number format be enforced?**  
   Recommendation: Soft inline warning only (not a hard block). Backend uppercases and trims. A hard format check risks failing on valid non-standard formats.

4. **Should exact quote and "said nothing" be a single combined control?**  
   Recommendation: Yes. A radio choice with conditional text input prevents the `quote_conflicts_with_said_nothing` contradiction at the form level and is simpler for the officer.

5. **Should checking "said nothing" disable the quote text box?**  
   Recommendation: Yes — and vice versa. If a quote is entered, the "said nothing" radio is deselected automatically.

6. **Should live API generation be behind a confirm checkbox?**  
   Recommendation: Yes. "Generate My Report" should require the officer to see the validation result first. A separate confirm step ("I have reviewed my answers and I am ready to generate") prevents accidental API calls and credit spend.

7. **Should output be copy-only before PDF/export?**  
   Recommendation: Yes for v1. Copy narrative and copy JSON are sufficient for v1. PDF requires additional infrastructure and is Step 5E or later.

8. **Should the form store anything between sessions?**  
   Recommendation: No persistence in v1. The form is stateless. localStorage draft saving is Step 5D, after the backend connection is confirmed working.

9. **Should the review checklist be required before Copy Narrative is enabled?**  
   Recommendation: Yes. All 12 checklist items must be checked before the copy button is enabled. This enforces that the officer read the report — it is not a workaround they should be able to skip.

10. **What framework?**  
    Not decided yet. Options: plain HTML/CSS/JS (simplest, no dependencies), or a minimal framework (e.g., React, Svelte). The backend is Node 24 native TypeScript with no npm packages. The UI framework should be decided before Step 5B begins and documented separately.

11. **Where does the server-side API run?**  
    Not decided yet. Options: same Node process serving static files, a separate Express/Hono/Fastify server, or a serverless function. Must be decided before Step 5C (backend connection). The key constraint: `ANTHROPIC_API_KEY` must live server-side only.

---

## K. Step roadmap summary

| Step | What | Scope |
|---|---|---|
| **5A** (this doc) | UI planning only | Documentation |
| **5B** | Static mock form — layout review | HTML/JS only, no API |
| **5C** | Backend connection — validate + generate wired | Real evaluate6_1 + generate6_1 calls |
| **5D** | Draft saving (localStorage) | No server storage yet |
| **5E** | PDF/text export | After copy-only is confirmed |
| **5F+** | Auth, multi-user, storage | Requires full security design first |
