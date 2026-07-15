# Step 4H — Charge 6-1 Intake Field Contract (Future UI)

**Version:** 1.0  
**Status:** Planning only — no UI implemented  
**Charge:** 6-1 — Disobeying Verbal or Written Order  
**Backend schema version:** 1.1  

---

## A. Purpose

This document is the contract between the future Charge 6-1 UI form and the locked 6-1 backend (`IntakeFacts6_1` → `generate6_1` pipeline).

Every field the UI form must collect maps to an `IntakeFacts6_1` field. This contract documents what the officer sees, what they are asked to provide, how the form should behave, and what the backend will do with each value.

The goal is to answer: **"What exact fields will the website form need to collect so it can produce a valid IntakeFacts6_1 JSON safely?"**

The officer remains the author of the report at all times. The backend does not decide guilt, recommend punishment, or invent facts.

---

## B. Non-goals for this step

- No UI implementation yet.
- No real data. All testing uses fake/sample data only.
- No other charges. This contract covers Charge 6-1 only.
- No API changes. The backend pipeline is locked.
- No schema changes. `IntakeFacts6_1` shape is not modified here.
- No storage design. Do not store real inmate data until a separate storage/security design is complete.

---

## C. Required field map

All 36 fields of `IntakeFacts6_1` are documented below.

### Field table legend

| Column | Meaning |
|---|---|
| Field | `IntakeFacts6_1` property name |
| Label | Officer-facing form label |
| Control | Recommended UI control type |
| Required | RED blocker if missing? |
| Gate impact | RED / YELLOW / none based on content |
| Cleanup | What the backend normalizes silently |
| Example | Sample officer input |

---

### Section 1 — Incident Basics

#### `incident_date`
| Attribute | Value |
|---|---|
| **Label** | Date of incident |
| **Control** | Date picker or free text |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_incident_date` |
| **Cleanup** | Passed through as-is (string) |
| **Example** | `March 12, 2026` |
| **Help text** | What date did this incident occur? Enter the date you personally observed the incident. |

---

#### `incident_time`
| Attribute | Value |
|---|---|
| **Label** | Time of incident |
| **Control** | Free text with format hint |
| **Required** | YES — RED blocker if blank or non-numeric |
| **Gate impact** | RED: `missing_incident_time` if blank or a non-numeric descriptor (e.g., "after chow," "late evening") |
| **Cleanup** | Normalized to `HHMM hours` format (e.g., `6:30 PM` → `1830 hours`, `1800` → `1800 hours`) |
| **Example** | `1400` or `2:00 PM` |
| **Help text** | What time did this incident occur? Use a number — 24-hour or 12-hour format is fine. "After chow" or "late evening" are not accepted. If unsure, give your best numeric estimate. |
| **Note** | Non-numeric time descriptors are a RED blocker. The form should warn if the input matches a known non-numeric pattern. |

---

### Section 2 — Reporting Officer / Assignment

#### `officer_rank`
| Attribute | Value |
|---|---|
| **Label** | Your rank |
| **Control** | Dropdown (recommended) or free text |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_officer_rank` |
| **Cleanup** | Abbreviations expanded (`sgt` → `Sergeant`, `lt` → `Lieutenant`, `ofc` → `Officer`). Common misspellings corrected (`sargent` → `Sergeant`). |
| **Example** | `Officer` / `Sergeant` / `Lieutenant` / `Captain` |
| **Help text** | Select your rank as it should appear in the report. |
| **Open question** | Should this be a dropdown to prevent typos? See Section J. |

---

#### `officer_name`
| Attribute | Value |
|---|---|
| **Label** | Your name (Last, First or full name) |
| **Control** | Text input |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_officer_name` |
| **Cleanup** | Title case applied. Hyphenated names preserved (`SMITH-JONES` → `Smith-Jones`). |
| **Example** | `T. Davis` or `Davis` |
| **Help text** | Enter your name as it should appear in the report. |

---

#### `officer_post`
| Attribute | Value |
|---|---|
| **Label** | Your post or assignment |
| **Control** | Text input |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_officer_post` |
| **Cleanup** | Typo corrections applied. Passed through otherwise. |
| **Example** | `housing officer` / `floor officer` / `wing officer` |
| **Help text** | What was your post or assignment when this incident happened? (Example: housing officer, floor officer, wing officer) |

---

#### `officer_activity`
| Attribute | Value |
|---|---|
| **Label** | What were you doing when this incident began? |
| **Control** | Text input or short textarea |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_officer_activity` |
| **Cleanup** | Typo corrections applied. Passed through otherwise. |
| **Example** | `conducting the master roster count` |
| **Help text** | Describe what you were doing at the time this incident started — not what you did in response, but what your assigned task was at that moment. (Example: conducting the master roster count, performing security rounds, distributing medication) |

---

### Section 3 — Inmate Identification

#### `inmate_last_name`
| Attribute | Value |
|---|---|
| **Label** | Inmate last name |
| **Control** | Text input |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_inmate_identity` |
| **Cleanup** | Title case. Hyphenated names preserved. |
| **Example** | `Smith` |
| **Help text** | Enter the inmate's last name exactly as it appears in FDOC records. |

---

#### `inmate_first_name`
| Attribute | Value |
|---|---|
| **Label** | Inmate first name (optional) |
| **Control** | Text input |
| **Required** | NO — not a RED blocker. Used in first reference only. |
| **Gate impact** | None |
| **Cleanup** | Title case if provided. |
| **Example** | `John` |
| **Help text** | Optional. Provide the inmate's first name if known — it appears in the first reference only. |

---

#### `dc_number`
| Attribute | Value |
|---|---|
| **Label** | Inmate DC number |
| **Control** | Text input with format hint |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_dc_number` |
| **Cleanup** | Uppercased and trimmed. Format preserved exactly (e.g., `A12345` stays `A12345`). |
| **Example** | `A12345` |
| **Help text** | Enter the inmate's DC number exactly as it appears. (Example: A12345) |
| **Open question** | Should the form enforce FDOC DC number format (letter + 5 digits)? See Section J. |

---

#### `narrative_reference_style`
| Attribute | Value |
|---|---|
| **Label** | How should the inmate be referred to in the report? |
| **Control** | Radio group (4 options) |
| **Required** | YES — RED blocker if null |
| **Gate impact** | RED: `missing_narrative_reference_style` |
| **Cleanup** | Passed through as enum value |
| **Options** | `he/him` / `she/her` / `they/them` / `last-name-only (no pronouns)` |
| **Help text** | Choose the pronouns for this inmate. "Last name only" will refer to the inmate as "Inmate Smith" throughout with no pronouns. |

---

### Section 4 — Location and Pre-Order Behavior

#### `dorm_area`
| Attribute | Value |
|---|---|
| **Label** | Dorm, wing, or area |
| **Control** | Text input or dropdown |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_dorm_area` |
| **Cleanup** | Trimmed. Passed through. |
| **Example** | `E Dorm` / `Wing 2` / `North Housing Unit` |
| **Help text** | What dorm, wing, or housing unit did this incident occur in? (Example: E Dorm, Wing 2, North Housing Unit) |
| **Open question** | Should this be a dropdown tied to the officer's assigned area? See Section J. |

---

#### `incident_location`
| Attribute | Value |
|---|---|
| **Label** | Exact incident location |
| **Control** | Text input |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_incident_location` |
| **Cleanup** | Trimmed. Passed through. |
| **Example** | `cell E3107` / `the Wing 2 dayroom` / `the shower area` |
| **Help text** | What is the exact location where this incident occurred? Be as specific as possible — include cell number, room name, or area. (Example: cell E3107, the Wing 2 dayroom, the shower area) |
| **Note** | Used verbatim in Paragraph 1. Dorm/area (`dorm_area`) is used separately in Paragraph 3. |

---

#### `inmate_behavior_before_order`
| Attribute | Value |
|---|---|
| **Label** | What was the inmate doing before you gave any order? |
| **Control** | Textarea (2–4 lines) |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_inmate_before_order` if blank. YELLOW: `conclusory_inmate_before_order` if vague/conclusory (e.g., "he was refusing," "acting up") |
| **Cleanup** | Typo corrections applied. Passed through for evaluator to assess. |
| **Example** | `standing at the cell door outside of his assigned cell` |
| **Help text** | Describe only what you could observe before you said anything — the inmate's physical position, location, or action at that exact moment. Do not describe compliance or refusal here. (Example: standing at the cell door outside of his assigned cell during count procedures) |

---

### Section 5 — Order Details

#### `order_type`
| Attribute | Value |
|---|---|
| **Label** | How was the order given? |
| **Control** | Radio group |
| **Required** | YES — RED blocker if null |
| **Gate impact** | RED: `missing_order_type` |
| **Cleanup** | Passed through as enum |
| **Options** | `verbal` / `written` / `both` |
| **Help text** | Was the order you gave verbal (spoken), written, or both? |

---

#### `exact_order`
| Attribute | Value |
|---|---|
| **Label** | What exactly did you order the inmate to do? |
| **Control** | Text input or short textarea |
| **Required** | YES — RED blocker if blank or vague |
| **Gate impact** | RED: `missing_specific_order` if blank. RED if order is a single vague verb with no object (e.g., "stop," "go," "move"). |
| **Cleanup** | First-person prefix stripped (`I told him to return to his cell` → `return to his assigned cell`). |
| **Example** | `return to his assigned cell` / `cease kicking the cell door` / `submit to hand restraints` |
| **Help text** | Write the command itself — not "I told him to" but what you ordered. Be specific enough that compliance was clear. Single-word commands like "stop" without explaining stop what are not accepted. (Example: return to his assigned cell, cease kicking the cell door) |

---

#### `total_orders_given`
| Attribute | Value |
|---|---|
| **Label** | How many total orders did you give? |
| **Control** | Number input or short text |
| **Required** | YES — RED blocker if null or vague |
| **Gate impact** | RED: `missing_specific_order_count` if null, if count is 0, or if a vague descriptor is provided ("several times," "multiple times," "a few times"). |
| **Cleanup** | String numbers parsed to integer (`"3 times"` → `3`). |
| **Example** | `3` |
| **Help text** | Enter the exact number of orders you gave — not an approximation. "Several times" and "multiple times" are not accepted. If you gave 3 orders, enter 3. |

---

### Section 6 — Inmate Response / Acknowledgment

#### `acknowledgment_type`
| Attribute | Value |
|---|---|
| **Label** | What showed the inmate received your order? |
| **Control** | Radio group or dropdown |
| **Required** | YES — RED blocker if null or `unknown` |
| **Gate impact** | RED: `missing_acknowledgment`. YELLOW: `within_hearing_distance_only` if the weakest option is selected with no other acknowledgment. |
| **Cleanup** | Passed through as enum |
| **Options** | `eye_contact` / `verbal_response` / `eye_contact_and_verbal_response` / `physical_reaction` / `actions_showed_awareness` / `within_hearing_distance` |
| **Help text** | Choose what showed the inmate received your order. "Within hearing distance" is the weakest option and may result in a review flag in the report. If the inmate made eye contact, responded verbally, or reacted physically, choose the more specific option. |

---

#### `inmate_quote`
| Attribute | Value |
|---|---|
| **Label** | What did the inmate say? (exact words) |
| **Control** | Text input |
| **Required** | Conditionally — RED if both `inmate_quote` and `inmate_said_nothing` are absent/false |
| **Gate impact** | YELLOW: `quote_is_summary` if the text matches summary patterns (e.g., starts with "he said he," "she told me"). YELLOW: `quote_conflicts_with_said_nothing` if both quote and said-nothing are set. |
| **Cleanup** | First character capitalized. Terminal punctuation added if missing. Words never changed. |
| **Example** | `No, I ain't doing that.` |
| **Help text** | Type the inmate's exact words — what actually came out of their mouth, as best as you remember. Do not describe what they said; quote it. If you can't remember exactly, type your best recollection. Profanity is preserved exactly as reported. |
| **Note** | See also `inmate_said_nothing`. Exactly one of these must be provided. |

---

#### `inmate_said_nothing`
| Attribute | Value |
|---|---|
| **Label** | The inmate said nothing in response |
| **Control** | Checkbox |
| **Required** | Conditionally — RED if both this and `inmate_quote` are absent |
| **Gate impact** | YELLOW: `quote_conflicts_with_said_nothing` if both this is true and a quote was also provided |
| **Cleanup** | Boolean. Defaults to `false` if null. |
| **Example** | `true` (checked) |
| **Help text** | Check this box if the inmate did not say anything in response to your order. Do not check this if the inmate spoke — use the quote field instead. |
| **Open question** | Should quote input and said-nothing be mutually exclusive controls (radio or single UI element)? See Section J. |

---

#### `inmate_tone`
| Attribute | Value |
|---|---|
| **Label** | How would you describe the tone of the inmate's response? |
| **Control** | Text input or dropdown with free text |
| **Required** | NO — but YELLOW if inmate spoke and tone is blank |
| **Gate impact** | YELLOW: `missing_tone_when_inmate_spoke` if `inmate_quote` is present and `inmate_tone` is null |
| **Cleanup** | Trimmed. Passed through. |
| **Example** | `loud and argumentative` / `sarcastic` / `calm but refusing` |
| **Help text** | How did the inmate's response sound? (Example: loud, argumentative, sarcastic, calm but refusing, hostile, profane) This is only needed if the inmate said something. |

---

### Section 7 — Inmate Physical Behavior

#### `physical_behavior`
| Attribute | Value |
|---|---|
| **Label** | What did the inmate physically do after you gave the order? |
| **Control** | Textarea (2–4 lines) |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_physical_behavior`. YELLOW: `conclusory_physical_behavior` if text uses conclusions ("being noncompliant," "being disrespectful"). YELLOW: `physical_behavior_duration_only` if text describes duration only with no observable action. |
| **Cleanup** | Typo corrections applied. Passed through for evaluator to assess. |
| **Example** | `crossed his arms and remained positioned at the cell door` |
| **Help text** | Describe what you saw the inmate physically do after your order — their position, movement, posture, or gestures. Do not use conclusions like "was noncompliant" or "was disrespectful." Describe only what you observed. (Example: crossed his arms and remained positioned at the cell door) |

---

### Section 8 — Operational Impact

#### `operational_impact`
| Attribute | Value |
|---|---|
| **Label** | How did this incident affect your area or operation? |
| **Control** | Textarea (2–4 lines) |
| **Required** | YES — field must be present (blank passes RED; vague content triggers YELLOW) |
| **Gate impact** | YELLOW: `vague_operational_impact` if text is fewer than 5 words, matches vague patterns ("yes," "it messed things up," "caused problems"), or is under 15 characters. |
| **Cleanup** | Typo corrections. Passed through. |
| **Example** | `temporarily interrupting the master roster count and drawing the attention of surrounding inmates` |
| **Help text** | Describe specifically how this incident affected your area or operation. What was interrupted, delayed, or disrupted? Reference the dorm or area — not the cell number. (Example: temporarily interrupting the master roster count and drawing the attention of surrounding inmates) |
| **Note** | `operational_impact` is not a RED blocker if the field is present (even short values pass to YELLOW). A truly blank field does not currently produce a RED blocker — this is a doc/code note recorded separately. |

---

### Section 9 — Ability to Comply

#### `ability_to_comply`
| Attribute | Value |
|---|---|
| **Label** | Did you observe any condition that may have prevented the inmate from complying? |
| **Control** | Radio group |
| **Required** | YES — RED blocker if null |
| **Gate impact** | RED: `missing_ability_to_comply`. RED: `medical_issue_no_explanation` if `issue_with_explanation` is selected but no explanation provided. |
| **Cleanup** | Passed through as enum |
| **Options** | `no_issue` (No apparent issue) / `issue_with_explanation` (Yes — describe below) |
| **Help text** | Did you observe any medical condition, mental health issue, physical limitation, or language barrier that might have prevented this inmate from following your order? If not, select "No apparent issue." If yes, describe what you observed below. |

---

#### `ability_to_comply_explanation`
| Attribute | Value |
|---|---|
| **Label** | Describe the condition that may have affected compliance |
| **Control** | Textarea — shown only when `issue_with_explanation` is selected |
| **Required** | Conditionally — RED if `ability_to_comply = issue_with_explanation` and this is blank |
| **Gate impact** | RED: `medical_issue_no_explanation` |
| **Cleanup** | Trimmed. Passed through. |
| **Example** | `The inmate appeared to be in medical distress and was holding his left arm.` |
| **Help text** | Describe what you directly observed or what was reported to you that may have affected the inmate's ability to comply. |

---

### Section 10 — Force / Use-of-Force Documentation

#### `force_used`
| Attribute | Value |
|---|---|
| **Label** | Was force used during this incident? |
| **Control** | Radio group (`yes` / `no`) |
| **Required** | YES — RED blocker if null (neither yes nor no) |
| **Gate impact** | RED: `missing_force_answer` if not explicitly `yes` or `no`. RED: `force_no_explanation` if `yes` with no explanation. |
| **Cleanup** | If `no`: sets `force_explanation = null`, `uof_documentation_status = not_applicable`. |
| **Options** | `yes` / `no` |
| **Help text** | Was any physical force used during this incident? Answer yes or no. |

---

#### `force_explanation`
| Attribute | Value |
|---|---|
| **Label** | Briefly describe the force used |
| **Control** | Textarea — shown only when `force_used = yes` |
| **Required** | Conditionally — RED if `force_used = yes` and this is blank |
| **Gate impact** | RED: `force_no_explanation` |
| **Cleanup** | Trimmed. Passed through. |
| **Example** | `This officer applied a wrist-lock technique to bring the inmate to the ground. A separate use-of-force report was completed.` |
| **Help text** | Briefly describe what force was applied and by whom. This is a brief factual summary for the DR — not a use-of-force report. The use-of-force report is a separate document. |

---

#### `uof_documentation_status`
| Attribute | Value |
|---|---|
| **Label** | Was separate use-of-force documentation completed? |
| **Control** | Radio group — shown only when `force_used = yes` |
| **Required** | NO — but YELLOW if force used and status not confirmed |
| **Gate impact** | YELLOW: `uof_documentation_not_confirmed` if `force_used = yes` and status is `not_confirmed` |
| **Cleanup** | If `force_used = no`: overridden to `not_applicable` regardless of input. If `force_used = yes`: only `completed` if explicitly confirmed, otherwise `not_confirmed`. |
| **Options** | `completed` (Yes, UOF documentation was completed) / `not_confirmed` (Not yet confirmed) / `not_applicable` (No force used — auto-set) |
| **Help text** | Was a separate Use of Force report completed for this incident? If yes, select "completed." This system does not generate the UOF report — only notes its status. |

---

### Section 11 — Confinement Outcome

#### `confinement_status`
| Attribute | Value |
|---|---|
| **Label** | What happened with confinement after this incident? |
| **Control** | Radio group |
| **Required** | NO — but see note |
| **Gate impact** | None (current code). Note: `gate_rules.json` lists `unclear_confinement_status` as a YELLOW but it is not yet implemented. See mismatch doc. |
| **Cleanup** | If `additional_facts` contains "disciplinary confinement," backend auto-corrects to "administrative confinement" and flags YELLOW: `disciplinary_confinement_corrected`. |
| **Options** | `placed` (Inmate was placed in administrative confinement) / `remained` (Inmate already in confinement, remained) / `none` (No confinement) |
| **Help text** | Was the inmate placed in administrative confinement after this incident? Administrative confinement is pre-hearing placement — not a punishment. If you type "disciplinary confinement," the system will correct it automatically. |
| **Note** | "Disciplinary confinement" is a post-hearing sanction and is auto-corrected to "administrative confinement" by the backend if found in `additional_facts`. |

---

### Section 12 — OIC Authorization

#### `oic_rank`
| Attribute | Value |
|---|---|
| **Label** | OIC rank |
| **Control** | Dropdown (recommended) or text input |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_oic_rank`. YELLOW: `oic_incomplete` if only rank and no name. |
| **Cleanup** | Abbreviations expanded (same rank map as officer rank). |
| **Example** | `Captain` / `Lieutenant` / `Sergeant` |
| **Help text** | What is the rank of the shift Officer in Charge (OIC) you notified? |
| **Open question** | Should this be a dropdown? See Section J. |

---

#### `oic_last_name`
| Attribute | Value |
|---|---|
| **Label** | OIC last name |
| **Control** | Text input |
| **Required** | YES — RED blocker if blank |
| **Gate impact** | RED: `missing_oic_last_name`. YELLOW: `oic_incomplete` if only name and no rank. |
| **Cleanup** | Title case applied. |
| **Example** | `Brown` |
| **Help text** | What is the last name of the OIC who authorized this report? |

---

### Section 13 — Optional Context

#### `witness_staff`
| Attribute | Value |
|---|---|
| **Label** | Were other staff members present? (optional) |
| **Control** | Textarea |
| **Required** | NO |
| **Gate impact** | YELLOW: `vague_witness_information` if provided but vague ("people saw it," "staff," fewer than 3 words). |
| **Cleanup** | Trimmed. Passed through. |
| **Example** | `Sergeant Johnson and Officer Williams were present during the incident.` |
| **Help text** | If other staff members witnessed this incident, provide their rank and last name. If no other staff were present, leave this blank. Vague entries like "other officers" or "everyone saw it" will produce a review flag. |

---

#### `camera_coverage`
| Attribute | Value |
|---|---|
| **Label** | Camera coverage information (optional) |
| **Control** | Textarea |
| **Required** | NO |
| **Gate impact** | None |
| **Cleanup** | Trimmed. Passed through. |
| **Example** | `This incident occurred within view of camera E3-12.` |
| **Help text** | Optional. If this incident was captured on camera, note the camera location or ID. Leave blank if unknown. |

---

#### `additional_facts`
| Attribute | Value |
|---|---|
| **Label** | Additional facts (optional) |
| **Control** | Textarea |
| **Required** | NO |
| **Gate impact** | YELLOW: `opinion_or_motive_language` if text contains opinion/motive language ("I think," "he was trying to," "on purpose"). YELLOW: `disciplinary_confinement_corrected` if text contains "disciplinary confinement." |
| **Cleanup** | Typo corrections. "disciplinary confinement" auto-corrected to "administrative confinement." |
| **Example** | `This incident was witnessed by multiple inmates in the dorm area.` |
| **Help text** | Any additional facts you want included in the report. Describe only what you observed — not what you believe the inmate intended. Opinion language ("I think," "he was trying to") will produce a review flag. |

---

### Section 14 — Review and Certification (internal flags — not officer-visible)

These fields are populated by the form logic, not by direct officer text input.

#### `separate_conduct_described`
| Attribute | Value |
|---|---|
| **Label** | (Internal: does the officer describe conduct beyond the order refusal?) |
| **Control** | Boolean — set by form logic or a UI question |
| **Required** | Defaults to `false` |
| **Gate impact** | RED: `cannot_isolate_6_1` if `true` and `separate_conduct_isolatable = false`. YELLOW: `conduct_outside_6_1_can_be_isolated` if `true` and `isolatable = true`. |
| **Help text** | "Does this report involve any conduct beyond the inmate refusing your order? (Example: the inmate also threatened staff, damaged property, or assaulted someone)" |

---

#### `separate_conduct_isolatable`
| Attribute | Value |
|---|---|
| **Label** | (Internal: can the 6-1 refusal be separated from the other conduct?) |
| **Control** | Boolean — set by form logic |
| **Required** | Only used when `separate_conduct_described = true` |
| **Gate impact** | RED: `cannot_isolate_6_1` if `false`. YELLOW: `conduct_outside_6_1_can_be_isolated` if `true`. |
| **Help text** | "Can we write a 6-1 report about the order refusal alone, without including the other conduct? Or is the other conduct so tied to the refusal that leaving it out would misrepresent what happened?" |

---

#### `request_to_invent`
| Attribute | Value |
|---|---|
| **Label** | (Internal: did the officer ask the AI to invent, assume, or embellish?) |
| **Control** | Boolean — always `false` in normal form submission |
| **Required** | Always `false` in legitimate use |
| **Gate impact** | RED: `request_to_invent` if `true` |
| **Note** | This field is a safety guardrail. It is never exposed to the officer as a direct control. The backend uses it to block AI misuse. The form always sends `false`. Future: a pre-submit disclaimer step could set this `true` if the officer attempts to use "make it sound worse" type language, triggering a hard stop. |

---

## D. Form sections

Recommended grouping for the future UI form. Each section maps to a backend intake region.

| # | Section | Key fields |
|---|---|---|
| 1 | Incident basics | `incident_date`, `incident_time` |
| 2 | Reporting officer | `officer_rank`, `officer_name`, `officer_post`, `officer_activity` |
| 3 | Inmate identification | `inmate_last_name`, `inmate_first_name`, `dc_number`, `narrative_reference_style` |
| 4 | Location and pre-order | `dorm_area`, `incident_location`, `inmate_behavior_before_order` |
| 5 | Order details | `order_type`, `exact_order`, `total_orders_given` |
| 6 | Inmate response | `acknowledgment_type`, `inmate_quote`, `inmate_said_nothing`, `inmate_tone` |
| 7 | Physical behavior | `physical_behavior` |
| 8 | Operational impact | `operational_impact` |
| 9 | Ability to comply | `ability_to_comply`, `ability_to_comply_explanation` |
| 10 | Force / UOF | `force_used`, `force_explanation`, `uof_documentation_status` |
| 11 | Confinement | `confinement_status` |
| 12 | OIC authorization | `oic_rank`, `oic_last_name` |
| 13 | Optional context | `witness_staff`, `camera_coverage`, `additional_facts` |
| 14 | Review and certification | `separate_conduct_described`, `separate_conduct_isolatable`, `request_to_invent` (internal), officer attestation |

---

## E. RED blocker field list

If any of these conditions are true when the officer submits, the backend returns RED and no narrative is generated. These must also be surfaced inline in the UI as the officer fills the form.

| Blocker ID | Field(s) | Trigger |
|---|---|---|
| `missing_incident_date` | `incident_date` | Blank |
| `missing_incident_time` | `incident_time` | Blank or non-numeric descriptor |
| `missing_officer_name` | `officer_name` | Blank |
| `missing_officer_rank` | `officer_rank` | Blank |
| `missing_inmate_identity` | `inmate_last_name` | Blank |
| `missing_dc_number` | `dc_number` | Blank |
| `missing_incident_location` | `incident_location` | Blank |
| `missing_officer_post` | `officer_post` | Blank |
| `missing_dorm_area` | `dorm_area` | Blank |
| `missing_officer_activity` | `officer_activity` | Blank |
| `missing_inmate_before_order` | `inmate_behavior_before_order` | Blank |
| `missing_order_type` | `order_type` | Null |
| `missing_specific_order` | `exact_order` | Blank or vague single verb |
| `missing_specific_order_count` | `total_orders_given` | Null, 0, or vague descriptor |
| `missing_acknowledgment` | `acknowledgment_type` | Null or `unknown` |
| `missing_inmate_response` | `inmate_quote` / `inmate_said_nothing` | Both absent/false |
| `missing_physical_behavior` | `physical_behavior` | Blank |
| `missing_ability_to_comply` | `ability_to_comply` | Null |
| `medical_issue_no_explanation` | `ability_to_comply_explanation` | `issue_with_explanation` selected but explanation blank |
| `missing_force_answer` | `force_used` | Not explicitly `yes` or `no` |
| `force_no_explanation` | `force_explanation` | `force_used = yes` but explanation blank |
| `missing_oic_rank` | `oic_rank` | Blank |
| `missing_oic_last_name` | `oic_last_name` | Blank |
| `cannot_isolate_6_1` | `separate_conduct_isolatable` | `separate_conduct_described = true` and `isolatable = false` |
| `request_to_invent` | `request_to_invent` | Flag is `true` |
| `missing_narrative_reference_style` | `narrative_reference_style` | Null |

---

## F. YELLOW warning triggers

If the form passes all RED blockers, the backend evaluates for YELLOW. YELLOW means a draft can be generated but the flagged paragraph needs officer review before certifying.

| Warning ID | Field(s) | Trigger | Paragraph |
|---|---|---|---|
| `quote_is_summary` | `inmate_quote` | Quote matches third-person summary pattern ("he said he," "she told me," etc.) | 2 |
| `quote_conflicts_with_said_nothing` | Both `inmate_quote` and `inmate_said_nothing` | Both are set simultaneously | 2 |
| `vague_operational_impact` | `operational_impact` | Too short, fewer than 5 words, or matches vague patterns | 3 |
| `conclusory_inmate_before_order` | `inmate_behavior_before_order` | Fewer than 5 words, or contains "refusing," "acting up," "wouldn't listen," etc. | 1 |
| `conclusory_physical_behavior` | `physical_behavior` | Contains "being disrespectful," "being noncompliant," "acting crazy," etc. | 2 |
| `physical_behavior_duration_only` | `physical_behavior` | Describes duration only with no observable action | 2 |
| `missing_tone_when_inmate_spoke` | `inmate_tone` | `inmate_quote` is present but `inmate_tone` is blank | 2 |
| `vague_witness_information` | `witness_staff` | Provided but fewer than 3 words, or matches vague patterns | 3 |
| `opinion_or_motive_language` | `additional_facts` | Contains "I think," "he was trying to," "on purpose," etc. | 2 |
| `oic_incomplete` | `oic_rank` / `oic_last_name` | One provided but not the other (partial — both missing is RED) | 6 |
| `within_hearing_distance_only` | `acknowledgment_type` | `within_hearing_distance` selected with no other acknowledgment | 2 |
| `conduct_outside_6_1_can_be_isolated` | `separate_conduct_isolatable` | `separate_conduct_described = true` and `isolatable = true` | 5 |
| `uof_documentation_not_confirmed` | `uof_documentation_status` | `force_used = yes` and status is `not_confirmed` | 4 |
| `disciplinary_confinement_corrected` | `additional_facts` | "disciplinary confinement" found — auto-corrected to "administrative confinement" | 6 |

**Not yet implemented (in `gate_rules.json` but not in code — see mismatch doc):**
- `implied_oic_authorization` — described in gate_rules.json but no check in evaluate6_1.ts
- `unclear_confinement_status` — described in gate_rules.json but no check in evaluate6_1.ts

---

## G. UI helper text for hard fields

Plain English text for fields officers most commonly get wrong.

### Exact order
> Write the command itself — what you told the inmate to do — not how you told them. For example, instead of "I told him to go back to his cell," write "return to his assigned cell." Single words like "stop" or "go" are not accepted without specifying stop or go what. If you said "stop," stop what exactly?

### Number of orders
> Enter the exact number of times you gave the order — not a guess or an approximation. "Several times," "multiple times," and "a few times" will not be accepted. If you gave 3 orders, enter 3.

### Exact quote vs. summary
> The quote field requires the exact words the inmate said — what actually came out of their mouth. Do not describe what they said; quote it. For example: type `No, I ain't doing that.` — not `He said he wasn't going to do it.` If you enter a description instead of a direct quote, the report will flag that paragraph for your review. Profanity is preserved exactly as you report it.

### Inmate said nothing
> Check this box only if the inmate did not say anything at all in response to your order. Do not check it if the inmate spoke. If you check this box and also type a quote, the system will flag a contradiction for your review.

### Ability to comply
> Did you observe any medical condition, mental health issue, physical limitation, or language barrier at the time of the incident that might have prevented the inmate from following your order? If you observed nothing that would have prevented compliance, select "No apparent issue." If yes, describe specifically what you observed or what was reported to you.

### Force used
> Answer yes or no. Not answering is not accepted — the report cannot be generated without a yes or no on force. If force was used, briefly describe what happened in your own words. This is a brief factual summary for the DR — not a use-of-force report. Complete the use-of-force report separately.

### Operational impact
> Describe specifically what was affected by this incident. What was interrupted, delayed, or disrupted? Reference the dorm, wing, or area — not the cell number. Avoid vague answers like "it caused problems" or "yes." (Example: temporarily interrupting the master roster count and drawing the attention of surrounding inmates in E Dorm)

### OIC authorization
> Enter the rank and last name of the shift Officer in Charge who you notified about this incident and who authorized you to initiate this report. Both rank and last name are required. Do not leave either blank.

---

## H. Future UI safety rules

These rules must be enforced in the UI layer before any API call is made.

1. **Officer must review before certifying.** The narrative is AI-formatted but officer-authored. The officer must read the complete narrative and confirm it is accurate before the report is used.

2. **The AI does not create facts.** Every fact in the narrative came from the officer's intake answers. The AI formats and structures — it does not invent witnesses, quotes, evidence, medical findings, locations, or intent.

3. **RED means no narrative.** If any RED blocker is present, no narrative is generated. The form must surface all blockers before allowing submission.

4. **YELLOW means review the flagged paragraph.** A YELLOW report is a draft. The flagged sections are marked `[REVIEW — ...]` and must be reviewed by the officer before the report is used. Do not remove the flags on the officer's behalf.

5. **GREEN still requires officer review.** GREEN means no flags were found based on the rules. It does not mean the report is certified. The officer must still read and verify the output.

6. **No raw real DR uploads into this module.** This module takes officer-provided answers, not uploaded report files. Do not build a document upload path here.

7. **Do not store real inmate data until storage/security is designed.** The current system processes intake data in memory and does not persist it. Do not add persistence until a separate storage and security design is complete.

8. **Live API calls should not happen until the officer confirms the intake facts.** The UI should run local validation (RED/YELLOW/GREEN check) before triggering a Claude API call. Do not send data to Claude until the officer has seen the validation result and explicitly requests generation.

9. **API key must never be exposed in the browser.** All Claude API calls must go through a server-side intermediary when the UI is built. The API key must never appear in frontend code, network responses, or browser storage.

---

## I. Proposed UI state flow

```
[1] Officer fills form
    → All 36 fields collected
    → Fields validated inline as officer types (format hints, required markers)

[2] Officer clicks "Check my answers"
    → Form submits to local validation (evaluate6_1 equivalent in UI or backend)
    → No Claude API call yet

[3a] RED → Show blockers
    → List all RED blockers with officer-friendly questions
    → Officer corrects and resubmits
    → No generation until all blockers are resolved

[3b] YELLOW → Show warnings
    → Show which fields produced warnings
    → Officer can choose to fix warnings or proceed to generation with review flags

[3c] GREEN → Ready to generate
    → No flags — show confirmation screen

[4] Officer clicks "Generate my report"
    → Claude API call triggered (server-side)
    → Loading state shown

[5] Claude returns JSON
    → Backend parses response (parseResponse6_1)
    → Backend validates against local evaluation (validateAgainstLocalEvaluation)
    → If validation fails: show error, allow retry

[6] Narrative displayed with review checklist
    → Six paragraphs shown
    → [REVIEW — ...] flags highlighted in YELLOW
    → Officer Review Checklist shown as checkboxes
    → AI Disclosure shown

[7] Officer reviews narrative
    → Officer reads each paragraph
    → Officer works through checklist
    → Officer may edit the narrative (text is editable — officer is the author)

[8] Officer certifies and copies/exports
    → Narrative is ready for copy or export only after officer confirms review
    → No auto-submit to FDOC system in this module
    → PDF or copy-to-clipboard (to be designed separately)
```

---

## J. Open questions before Step 5 UI

These decisions should be made before any UI form implementation begins.

1. **Should officer rank be a dropdown?** A dropdown prevents typos and ensures consistent rank labels. Tradeoff: may not cover all rank variants across all facilities. Recommendation: dropdown with "Other / free text" escape.

2. **Should OIC rank be a dropdown?** Same tradeoff. OIC rank is often different from officer rank. Recommendation: separate dropdown matching the rank map.

3. **Should dorm/area be free text?** Officers across different facilities use different naming conventions. A free-text field is the safest option to start, with a dropdown added per-facility later if needed.

4. **Should DC number format be enforced in the form?** FDOC DC numbers are typically one letter followed by five digits (e.g., `A12345`). Enforcing this format in the UI would catch transcription errors early. Tradeoff: format variations across releases and record types may cause false failures. Recommendation: soft warning only, not a hard block.

5. **Should exact quote and "said nothing" be separate controls?** Currently they are separate fields. The contradiction case (`quote_conflicts_with_said_nothing`) is caught as YELLOW. A better UI design may be a single control: radio buttons ("The inmate said: [text input]" / "The inmate said nothing"). This would prevent the contradiction at the form level before backend validation.

6. **Should "summary quote" be an explicit checkbox?** Officers sometimes know they are summarizing and not quoting. An explicit "I am not sure of the exact words" checkbox could suppress the `quote_is_summary` flag and trigger the "verbally responded in substance" pathway without the need for YELLOW review. This requires a prompt rule change and backend update.

7. **Should output be copy-only first before PDF/export?** PDF generation and export require additional infrastructure. A copy-to-clipboard or plain text download may be a safer first release.

8. **Should live API be disabled by default in the UI until the officer confirms?** Yes. The recommended flow (Section I) already gates the API call behind an explicit "Generate my report" click. This must also require `ANTHROPIC_API_KEY` to be set server-side — it must never be exposed in the browser.

9. **Should the form save draft state between sessions?** Draft persistence requires storage design. Not recommended until storage/security is designed separately. First release: no persistence, form is stateless.

10. **Should the officer review checklist be interactive checkboxes?** The checklist currently exists in the output JSON as a string array. A UI could render these as interactive checkboxes that must all be checked before the "Copy / Export" button is enabled.

11. **Should UOF documentation status be asked only when force = yes?** Yes — this is the recommended conditional display behavior. The field is meaningless when force was not used.

---

## K. Field count summary

| Category | Count |
|---|---|
| Total `IntakeFacts6_1` fields | 36 |
| Required (RED blocker if missing) | 23 |
| Conditionally required | 3 (`ability_to_comply_explanation`, `force_explanation`, `inmate_quote` OR `inmate_said_nothing`) |
| Optional (may trigger YELLOW if vague) | 5 (`inmate_tone`, `witness_staff`, `camera_coverage`, `additional_facts`, `confinement_status`) |
| Internal / form-logic only (not officer-visible as direct inputs) | 3 (`separate_conduct_described`, `separate_conduct_isolatable`, `request_to_invent`) |
| Narrative reference (radio, officer-visible) | 1 (`narrative_reference_style`) |
| Enum / dropdown fields | 7 (`order_type`, `acknowledgment_type`, `ability_to_comply`, `force_used`, `uof_documentation_status`, `confinement_status`, `narrative_reference_style`) |
| Fields with silent backend cleanup | 12 (time, rank, name, order, quote, DC number, OIC rank/name, confinement term, typos) |
