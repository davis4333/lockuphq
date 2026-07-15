# LOCKUPHQ DR Writer — Charge 6-1 Knowledge Base Master Document
**Version:** v1.1 — Step 2E Consolidated Final Master  
**Status:** Step 2C final lock + Step 2D 10/10 validation + Step 2E micro patch merged. Ready for 6-1 implementation planning.  
**Charge:** 6-1 — Disobeying Verbal or Written Order  
**Scope:** Florida Department of Corrections — DC6-112F Section II Statement of Facts narrative only  
**Claude Contract Version:** v1.1 — Charge 6-1 Only  
**Schema Version:** 1.1  

---

> **FORMAT NOTE (2026-07-01) — READ BEFORE USING SECTION 4, 11, OR 12 BELOW.**
>
> The "Locked Six-Paragraph Output Format" in Section 4 (and the matching six-paragraph
> instructions in Sections 11, 12, and 14) is **deprecated**. It was checked against 62 real,
> accepted FDOC Charge 6-1 disciplinary reports (Okeechobee CI, 2018-2023) and every one of
> them was ONE continuous paragraph (median 145 words, range 89-240) — no section headers,
> no six-part structure. FDOC accepts and expects the single-paragraph format.
>
> `docs/lockuphq_dr_writer_master_prompt_corrected.md` is now the source of truth for output
> format, narrative construction order, and prompt content. It keeps this document's Level 1/2
> authority hierarchy, required fact slots, RED/YELLOW gates, and forbidden-language list —
> those held up. It restores the real single-paragraph structure while holding a *stricter*
> standard than loose real-world practice on the two things that were genuinely weak in both
> the practice examples and the real accepted reports: order counts (always require a specific
> number) and behavior language (flag conclusory terms like "disobedient" or "noncompliant"
> without an observable fact behind them). See `examples/6-1/notes/6-1_practice_example_analysis.md`
> for the fuller resolution note.
>
> The `affected_paragraph` field (Sections 7, 12) and `gate_rules.json` still use the numbers
> 1–6 as an internal fact-category tag (which cluster of fields a warning belongs to) — they no
> longer mean "output paragraph index," since there is only one output paragraph now.

---

## 0. Product Boundary

The LOCKUPHQ DR Writer does not decide guilt, recommend punishment, invent facts, or replace the reporting officer. The officer remains the author of the report and must review, edit, and certify the final narrative before submission.

The tool converts officer-provided facts into a clean, professional, policy-aware Section II Statement of Facts narrative. If required facts are missing, the system must return a RED status and a list of blockers instead of generating a report.

The system may improve grammar, structure, tone, spelling, time formatting, rank formatting, and report flow. It may not fabricate facts, witnesses, evidence, quotes, medical findings, force details, locations, authorization, or inmate intent.

This KB covers Charge 6-1 only. No other charge logic, alternate charge codes, or cross-charge decisions are made inside this module. If the officer's answers describe conduct that may fall under a different charge, a general warning is returned. The 6-1 module does not name or assign alternate charge codes until those charge modules are researched and built.

---

## 1. Source Authority Hierarchy

The knowledge base uses three authority levels. If any conflict exists between levels, the higher authority controls.

### Level 1 — Official Rule / Policy Sources
Highest authority. These sources control required elements, gates, and guardrails.

- Florida Administrative Code Rule 33-601.303 — Reporting Disciplinary Infractions
- Florida Administrative Code Rule 33-601.304 — Preparation of Disciplinary Reports
- Florida Administrative Code Rule 33-601.308 — Disciplinary Team / Hearing Officer Findings and Action
- Florida Administrative Code Rule 33-601.314 — Rules of Prohibited Conduct and Penalties for Infractions
- Florida Administrative Code Rule 33-602.220 — Administrative Confinement
- Other FDOC rules, forms, post orders, local written procedures, and internal guidance only when lawfully available and approved for use

### Level 2 — Charge Module Guardrails
Charge-specific rules derived from the official sources and practical reporting requirements. For 6-1 this includes the locked report format, required fact slots, red blockers, yellow warnings, cleanup rules, and forbidden language. These are binding within the module.

### Level 3 — Sanitized DR Style Examples
Sanitized real DR examples may be used for style, flow, phrase patterns, and real-world wording only. They are not legal authority. If a sanitized example conflicts with an official rule or charge guardrail, the official rule and charge guardrail control.

**Hierarchy:** Official source → Charge guardrail → Sanitized example

---

## 2. Official Rule Baseline for 6-1

### Rule 33-601.303 — Reporting Disciplinary Infractions
- Officers are required to report disciplinary infractions in a timely manner
- Timing requirements must be verified against facility-specific post orders and local written procedures before any timing gate is implemented in this system
- NOTE: Do not hardcode a 24-hour report submission gate until Rule 33-601.303 and Rule 33-601.305 are sourced precisely and the distinction between DR submission timing and investigation initiation timing is confirmed. This is a future research item.

### Rule 33-601.304 — Preparation of Disciplinary Reports
- Only one violation should be included in each disciplinary report
- Separate DRs must be used for multiple offenses
- The statement of facts must include a description of the violation including date, time, and place
- The statement of facts must identify the specific rule violated
- The statement of facts must include a formal statement of the charge
- The statement of facts should include unusual inmate behavior
- The statement of facts should include physical evidence and disposition when applicable
- The statement of facts should include immediate action taken
- The statement of facts must include enough facts for the reader to understand the charge without additional explanation

### Rule 33-601.308 — Findings and Action
- Findings rely on specific facts derived from the DR, investigation, witness statements, and evidence
- A DR may be dismissed due to procedural errors, technical errors, or duplicate charges
- An inmate is found not guilty when the facts do not support the charge
- AI implication: the report must be specific, factual, and charge-matched. Vague polished writing is not enough. A report that reads well but lacks required factual elements will still be dismissed.

### Rule 33-601.314 — Rules of Prohibited Conduct and Penalties
- Code: 6-1
- Title: Disobeying verbal or written order
- Full description: Disobeying verbal or written order — any order given to an inmate or inmates by a staff member or other authorized person
- Maximum listed penalty: 30 DC + 60 GT

### Rule 33-602.220 — Administrative Confinement
- Administrative confinement is temporary separation from general population for security or safety while a more permanent inmate-management decision is pending
- Placement may be authorized when disciplinary charges are pending and temporary separation is needed for security or safety
- AI implication: if the officer selects placed in administrative confinement the correct output line is "Inmate [LAST NAME] was placed in administrative confinement pending the outcome of this disciplinary report." If the inmate was already in confinement before this incident the correct line is "Inmate [LAST NAME] remained in administrative confinement pending the outcome of this disciplinary report." If no confinement occurred, the confinement line is omitted entirely.
- Cleanup rule: if the officer types "disciplinary confinement" in the confinement field before a hearing has occurred, automatically convert to "administrative confinement" and surface a yellow note explaining that disciplinary confinement is a post-hearing sanction, not a pre-hearing placement.

---

## 3. Charge 6-1 Definition

**Charge Code:** 6-1  
**Charge Title:** Disobeying verbal or written order  
**Full Charge Description:** Disobeying verbal or written order — any order given to an inmate or inmates by a staff member or other authorized person  
**Maximum Penalty:** 30 days DC + 60 days GT  

### Core Theory of the Charge
The inmate received a lawful verbal or written order from a staff member or other authorized person and failed or refused to comply with that order.

### What the Report Must Prove
A strong 6-1 report must establish all of the following:

1. A staff member or authorized person gave an order
2. The order was directed to the inmate specifically or to inmates generally in a way that applied to this inmate
3. The order was specific enough that compliance was clear — the inmate would have known exactly what to do to comply
4. The inmate heard, acknowledged, responded to, or was positioned close enough to receive the order
5. The inmate had an opportunity to comply
6. The inmate failed or refused to comply
7. The failure or refusal was supported by observable facts, not opinion or conclusion
8. No apparent medical, mental health, physical, or language barrier prevented compliance, unless the officer reported one
9. The behavior affected the secure, orderly, or normal operation of the area or institution, or the report clearly explains the operational context
10. The shift OIC or appropriate supervisor was notified and authorized the report when required by facility process

---

## 4. Locked Six-Paragraph Output Format — DEPRECATED, kept for historical reference only

**This section no longer reflects the required output format.** See the FORMAT NOTE above and
`docs/lockuphq_dr_writer_master_prompt_corrected.md`. The current format is ONE continuous
paragraph (no section headers, no paragraph breaks), built in the same content order described
below (scene → order/response → operational impact if present → ability-to-comply/force if
present → charge advisory → confinement/OIC close). The fact-content rules in this section
(order count wording, quote handling, tone, physical behavior, operational impact, OIC rules)
are still correct and still apply — only the "one paragraph per numbered item, joined with line
breaks" packaging is deprecated.

Every 6-1 DR generated by LOCKUPHQ must follow this paragraph order. Facts change. Format does not. Paragraphs may not be reordered, merged, or skipped.

---

### Paragraph 1 — Opening / Assignment / Scene / Inmate Behavior Before Order

**Purpose:** Establish date, time, officer role, activity, dorm or area, exact location, inmate identity, and what the inmate was doing before the order was given. The reader must see the scene before the officer said anything.

**Template:**
> On [DATE], at approximately [TIME], I, [RANK] [OFFICER NAME], was assigned as [POST / ASSIGNMENT] in/at [DORM / AREA]. While [OFFICER ACTIVITY], I approached [SPECIFIC LOCATION] and observed Inmate [LAST NAME], [FIRST NAME] DC# [DC NUMBER], [OBSERVABLE INMATE BEHAVIOR BEFORE ORDER].

**Critical rules for this paragraph:**
- This paragraph must not jump straight to what the officer did. It must first state what the inmate was doing that caused the order to become necessary.
- The inmate-before-order slot must be observational, not conclusory. Show what was seen. Do not label it as refusal or noncompliance before the order is given.
- Preferred observable language: "standing at the cell door outside of his assigned cell," "remaining stationary outside of his assigned bunk area during count procedures," "blocking the cell doorway," "remaining in the shower area after being directed to exit," "remaining in the dayroom past the designated return time."
- Do not write "refusing" in Paragraph 1 unless the surrounding facts already clearly show noncompliance in context and the officer specifically observed that behavior before any order was given.
- If the officer's inmate-before-order answer is fewer than five words or is a conclusion rather than an observation, surface a yellow warning and ask a clarifying follow-up before generating. "He wouldn't go in" is not enough. "Standing at the cell door outside of his assigned cell during count procedures" is enough.
- The dorm or area reference is required at the template level, not optional. Do not omit the area from Paragraph 1.

---

### Paragraph 2 — Order / Repetition / Acknowledgment / Refusal / Physical Behavior

**Purpose:** Prove all required elements of the 6-1 charge.

**Must include:**
- Order type: verbal, written, or both
- Exact order given — the command itself, not the officer's description of giving it
- Specific number of total orders given — never "several times" or "multiple times"
- Facts showing the inmate heard, acknowledged, responded to, or was positioned to receive the order
- Exact quote if the inmate spoke, or a documented statement that the inmate said nothing
- Tone of the response if the inmate spoke
- Physical behavior after the order — observable actions only, not conclusions

**Template:**
> At this time, I issued a direct [VERBAL / WRITTEN] order to Inmate [LAST NAME] to [EXACT ORDER]. [ORDER COUNT SENTENCE]. Inmate [LAST NAME] [ACKNOWLEDGMENT SENTENCE] and stated in a [TONE] tone, "[EXACT QUOTE]." Inmate [LAST NAME] then [PHYSICAL BEHAVIOR AFTER ORDER].

**Order count sentence rules:**
- 1 total order: The opening sentence absorbs the count. Write: "At this time, I issued one direct [verbal/written] order to Inmate [LAST NAME] to [ORDER]." Do not add a separate order-count sentence. Adding one would duplicate the order reference.
- 2 total orders: "At this time, I issued a direct [verbal/written] order to Inmate [LAST NAME] to [ORDER]. I repeated this directive one additional time, for a total of two [verbal/written] orders."
- 3 total orders: "At this time, I issued a direct [verbal/written] order to Inmate [LAST NAME] to [ORDER]. I repeated this directive two additional times, for a total of three [verbal/written] orders."
- 4 or more orders: "At this time, I issued a direct [verbal/written] order to Inmate [LAST NAME] to [ORDER]. I repeated this directive [NUMBER MINUS ONE] additional times, for a total of [TOTAL NUMBER] [verbal/written] orders."
- Never use "several times" or "multiple times." Vague order count is a RED blocker. See Section 6.

**Acknowledgment sentence rules — select the appropriate version based on officer input:**
- Eye contact confirmed: "Inmate [LAST NAME] made direct eye contact with this officer"
- Verbal response only: "Inmate [LAST NAME] verbally responded to this officer's directive"
- Eye contact and verbal response: "Inmate [LAST NAME] made direct eye contact with this officer and verbally responded to the directive"
- Physical reaction — turned toward officer: "Inmate [LAST NAME] turned toward this officer in response to the directive"
- Inmate actions showed awareness before order: "Inmate [LAST NAME]'s actions indicated awareness of this officer's presence prior to the directive being issued"
- Within hearing distance, no acknowledgment: "Inmate [LAST NAME] was positioned within hearing distance of this officer's directive" — use this carefully; surface a yellow warning if this is the only acknowledgment fact documented, as it is the weakest option
- Unknown: RED blocker. Cannot generate without some evidence the inmate received the order.

**Quote rules:**
- Exact inmate words go inside quotation marks. Nothing else goes inside quotation marks.
- Do not convert a summary into a quote under any circumstances.
- If officer types "he said he wasn't doing it" or any other description of what the inmate said rather than the actual words, surface a yellow warning: "It sounds like you summarized what the inmate said. What exact words came out of his mouth? If you cannot remember exactly, type your best recollection and we will note it as approximate." Never put a summary in quotation marks.
- If inmate said nothing: "Inmate [LAST NAME] did not verbally respond to this officer's directive and [PHYSICAL BEHAVIOR]." No quotation marks anywhere in the sentence.
- Preserve profanity exactly as spoken if the officer provides it. Do not sanitize inmate quotes.
- Clean capitalization and punctuation inside the quote only — do not change any words.

**Tone rules:**
- Tone describes how something was said, not a legal conclusion.
- Acceptable tone descriptors: loud, argumentative, loud and argumentative, yelling, sarcastic, calm but refusing, hostile, profane (only if the actual quote contains profanity).
- Avoid stacking more than two or three tone words. "Loud, argumentative, hostile, disrespectful, and non-compliant" is over-stacked and sounds manufactured.
- Do not use "non-compliant tone" as the only tone descriptor. It is a legal conclusion, not a description of how something sounded.

**Physical behavior rules:**
- Physical behavior and tone are two separate observations documented in separate sentences. What the inmate did physically and how they sounded are not the same thing and must never be combined into one descriptor.
- Visual behavior goes in one sentence. Auditory behavior goes in another.
- Wrong: "Inmate Smith stood aggressively in a loud manner."
- Right: "Inmate Smith assumed an aggressive stance, crossing his arms and positioning himself in the doorway. Inmate Smith raised his voice in a loud and argumentative manner audible to surrounding inmates."
- Observable action only. Not conclusions.
- Wrong: "he was noncompliant," "he was disrespectful," "he was acting up"
- Right: "crossed his arms and remained positioned at the cell door," "turned away from this officer and remained seated on his bunk," "continued standing in the doorway without moving"
- If the officer provides a duration without an observable action ("he stood there for twenty minutes"), surface a yellow warning and ask for the observable behavior. Duration alone does not paint the picture.

---

### Paragraph 3 — Operational Impact

**Purpose:** Document the effect of the inmate's conduct on the secure and orderly operation of the institution. This paragraph is required. It may not be omitted even in low-disruption scenarios.

**Template:**
> This conduct disrupted the orderly operation of [AREA] by [SPECIFIC OPERATIONAL IMPACT].

**Preferred phrasing:**
- "temporarily interrupting the master roster count" — not "delaying count" or "messing up count"
- "drawing the attention of surrounding inmates" — not "other inmates saw it" or "everyone was watching"
- "requiring staff attention away from normal duties" — when the incident pulled the officer from assigned responsibilities
- "interrupting inmate movement," "interrupting shower operations," "interrupting meal service" — based on officer-provided facts only

**Minimum operational impact standard:**
Even if the officer reports no additional disruption beyond the immediate refusal, this paragraph must still document the operational context. Do not omit the paragraph. Minimum acceptable output when no additional disruption is reported:
> This incident occurred during [OFFICER ACTIVITY] in [AREA], requiring this officer's immediate attention away from assigned duties.

**Operational area rule:**
The impact paragraph must reference the dorm, wing, or facility area — never a cell number. A cell is not an operation.
- Wrong: "disrupted the orderly operation of cell E3107"
- Right: "disrupted the orderly operation of E Dorm"

Do not repeat witness information in Paragraph 3 if the impact sentence already states that surrounding inmates' attention was drawn. One reference is enough.

Do not overstate impact. Only document what the officer provided. Do not add inmates, disruptions, or security consequences the officer did not report.

---

### Paragraph 4 — Ability to Comply / Force

**Purpose:** Close common defenses and document force status.

**Template — no issue, no force:**
> Inmate [LAST NAME] displayed no apparent medical condition, mental health issue, physical limitation, or language barrier that would have prevented compliance with this officer's directive. No use of force was required.

**If a medical, mental health, physical, or language issue was observed or reported:**
- Do not bury the issue
- Do not conclude the inmate could comply if the facts are unclear
- Return a yellow warning requiring officer clarification before generating this paragraph
- Do not invent or assume the inmate's ability to comply

**If force was used — v1.1 force schema:**
- Do not write a use-of-force report inside the DR narrative.
- Do not add force facts not supplied by the officer.
- `force_used` must be either `no` or `yes`.
- If `force_used = no`, then `force_explanation = null` and `uof_documentation_status = not_applicable`.
- If `force_used = yes` and `force_explanation = null`, surface a RED blocker and do not generate.
- Before generating any force-related line, the system must ask: "Was separate use-of-force documentation completed for this incident?" Do not state that a use-of-force report or documentation was completed unless the officer specifically confirms completion.
- If officer confirms UOF documentation was completed, output: "Separate use-of-force documentation was completed regarding the force used during this incident."
- If force was used and explained, but UOF documentation completion is not confirmed, status should be YELLOW unless later local policy requires RED. The narrative must not state that documentation was completed. Any force-related line in a YELLOW draft must be marked for review.

---

### Paragraph 5 — Rule Connection / Charge Advisory

**Purpose:** Connect the inmate's conduct to FDOC rules and staff authority, then document the charge advisory.

**Template:**
> Inmate [LAST NAME]'s conduct is in direct violation of the Florida Department of Corrections Rules of Prohibited Conduct and undermines the lawful authority of correctional staff and the secure and orderly operation of the institution. I then advised Inmate [LAST NAME] that [PRONOUN] would receive a disciplinary report for Section 6-1, Disobeying verbal or written order — any order given to an inmate or inmates by a staff member or other authorized person.

**Critical rules:**
- Use "I then advised" to preserve chronological sequence in the narrative
- Use "would receive" — past tense reporting of the advisory moment. Do not use "will be receiving." Enforce consistently.
- The pronoun in the charge advisory must match the narrative reference style selected at intake (he/she/they/last-name-only)
- Do not recommend punishment
- Do not add guilt language beyond the required charge advisory
- Do not name alternate charges or suggest other violations in this paragraph

**One-violation rule:**
If the officer's answers describe conduct that may fall outside the 6-1 charge, surface this general warning only — do not name specific alternate charge codes:
> "Your answers may describe conduct outside this 6-1 disobeying-order charge. This report will only document the order and the inmate's failure or refusal to comply. A separate report may be required for any other conduct."

---

### Paragraph 6 — Administrative Confinement / OIC Closing

**Purpose:** Document immediate action taken and authorization for the report.

**Templates — select based on officer input:**

Placed in administrative confinement:
> Inmate [LAST NAME] was placed in administrative confinement pending the outcome of this disciplinary report. The shift Officer in Charge, [OIC RANK] [OIC LAST NAME], was notified and authorized the initiation of this report.

Remained in administrative confinement:
> Inmate [LAST NAME] remained in administrative confinement pending the outcome of this disciplinary report. The shift Officer in Charge, [OIC RANK] [OIC LAST NAME], was notified and authorized the initiation of this report.

Not placed in confinement:
> The shift Officer in Charge, [OIC RANK] [OIC LAST NAME], was notified and authorized the initiation of this report.

**OIC rules:**
- Rank plus last name is required at minimum. Full output: "Captain Brown," "Sergeant Jones," "Lieutenant Smith"
- "Brown" alone is not acceptable
- "The captain" alone is not acceptable
- All ranks must be fully spelled out: Sergeant, Lieutenant, Captain, Major, Colonel
- If OIC is provided as rank only or name only, surface a yellow warning and ask for the missing element
- If OIC authorization is described as implied ("the captain knew about it") rather than explicit, surface a yellow warning: "Please confirm the OIC was directly notified and authorized this report. What is the OIC's rank and last name?"

**Disciplinary confinement cleanup rule:**
If the officer types "disciplinary confinement" before a hearing has occurred, automatically convert to "administrative confinement" and surface this yellow note:
> "Note: Disciplinary confinement is a post-hearing sanction. Pre-hearing placement is administrative confinement. This has been corrected in the report."

---

## 5. Required Fact Slots

### Required for generation — RED blocker if missing:
1. Incident date
2. Incident time or approximate time
3. Reporting officer rank
4. Reporting officer name
5. Officer post or assignment
6. Dorm or area
7. Officer activity when incident began
8. Exact incident location
9. Inmate last name
10. Inmate first name if available
11. DC number
12. Narrative reference style (he/him, she/her, they/them, or last-name-only)
13. Observable inmate behavior before the order — must be observational, not conclusory
14. Order type: verbal, written, or both
15. Specific order given — must be clear enough that compliance can be determined
16. Total number of orders given — must be a specific number
17. Facts showing inmate heard, acknowledged, responded to, or was positioned to receive the order
18. Exact quote, or explicit confirmation that inmate said nothing
19. Physical behavior after the order — observable actions only
20. Operational impact statement or explicit confirmation of minimal disruption
21. Ability-to-comply answer: no issue, or issue with explanation
22. Force answer: no force, or force with explanation
23. Confinement status
24. OIC rank
25. OIC last name

### Helpful but optional — yellow warning if vague:
- Tone of inmate's verbal response (yellow warning if inmate spoke but tone is missing)
- Witness names and titles if other staff were present
- Whether the area was under fixed camera coverage
- Specific number of inmates who observed the behavior
- Duration of any disruption if known
- Any other facts the officer considers relevant — facts only, no opinion

---

## 6. Red Blockers

A RED status means the system must not generate a final narrative. The system returns the blocker list and plain-English follow-up questions only. No partial narrative is generated under RED status.

**Red blockers:**
1. Missing incident date
2. Missing incident time or approximate time — includes non-numeric time references such as "around lunchtime," "late evening," or "after chow." A descriptor is not a time. A numeric approximate time is required before generation.
3. Missing officer name
4. Missing officer rank
5. Missing inmate identity (last name minimum)
6. Missing DC number
7. Missing specific incident location
8. Missing officer post or assignment
9. Missing dorm or area
10. Missing officer activity when incident began
11. Missing observable inmate behavior before the order
12. Missing order type
13. Missing specific order — order too vague to determine what compliance required (example: "I told him to stop" without specifying stop what)
14. Missing total number of orders — any vague count including "several times," "multiple times," "a few times," or any non-numeric count descriptor. The number of orders given is a core 6-1 element. The report must not generate until a specific number is provided.
15. No facts showing the inmate heard, acknowledged, responded to, or was within hearing distance of the order — unknown acknowledgment with no supporting context
16. Missing inmate response — neither an exact quote nor explicit confirmation that inmate said nothing
17. Missing physical behavior after the order
18. Missing ability-to-comply answer
19. Force used selected but no force explanation provided
20. Medical, mental health, physical, or language issue selected but no explanation provided
21. Missing OIC rank
22. Missing OIC last name
23. Officer explicitly asks the AI to include multiple separate violations in one 6-1 narrative, or the facts describing separate conduct are so intertwined that the 6-1 refusal cannot be isolated from other conduct without inventing or omitting facts
24. Officer asks AI to invent, assume, embellish, or "make it sound worse"
25. Facts clearly indicate this incident does not meet the elements of a 6-1 charge
26. Missing narrative reference style when pronouns will appear in the narrative

---

## 7. Yellow Warnings

A YELLOW status means all required facts are present but one or more are weak, vague, or need clarification. Under YELLOW status the system may generate a marked review draft only. The draft must not be treated as a final certifiable report. Every section derived from a weak or vague answer must be marked with a [REVIEW] flag so the officer knows exactly which lines need attention before certifying.

**Yellow warnings:**
1. Quote sounds like a summary rather than exact words — officer typed a description of what the inmate said instead of the actual words
2. Operational impact is vague — officer typed "it messed things up," "caused problems," or "yes" without specifics
3. Inmate-before-order behavior is a conclusion rather than an observation — "he was refusing," "he wouldn't listen," "he was acting up"
4. Physical behavior described as a conclusion rather than an observable action — "being disrespectful," "being noncompliant," "acting crazy"
5. Physical behavior described as a duration without an observable action — "he stood there for twenty minutes" without describing what he was doing or how he was positioned
6. Tone missing when the inmate gave a verbal response
7. Witness information vague — "people saw it," "everyone," "staff" without names or titles
8. Extra facts include opinion or motive — "I think," "he was trying to," "on purpose," "wanted to make me mad"
9. OIC provided as rank only or last name only without the other
10. OIC authorization described as implied rather than explicit — "the captain knew about it" rather than "Captain Brown was notified and authorized the report"
11. Confinement status unclear or ambiguous
12. "Within hearing distance" is the only acknowledgment fact and no direct response, eye contact, physical reaction, or gesture is documented — weakest acknowledgment option, flag for officer review
13. Acknowledgment described as "unknown" or "not sure" — strong yellow or red depending on whether any supporting context exists
14. Inmate-before-order behavior is fewer than five words or too general to translate into observational language
15. Conduct described in the answers appears to fall outside or beyond the 6-1 charge but the 6-1 refusal can still be isolated — generate only the 6-1 portion and surface this warning: "Your answers may describe conduct outside this 6-1 disobeying-order charge. This report will only document the order and the inmate's failure or refusal to comply. A separate report may be required for any other conduct." Do not name alternate charge codes.

**Suggested yellow behavior:**
- Show the specific warning with a plain-English explanation
- Provide one example of a stronger answer
- Ask one follow-up question
- Generate the marked draft only if no red blockers exist
- Mark every affected section with [REVIEW — reason] so the officer sees exactly what to fix

---

## 8. Cleanup and Translation Rules

The AI translates plain officer language into formal FDOC report language. Facts are preserved. Only grammar, structure, formatting, rank titles, time format, and language register are changed. The officer's factual account is never altered.

### Time cleanup
- "6pm" → "1800 hours"
- "830pm" → "2030 hours"
- "12pm" or "noon" → "1200 hours"
- "midnight" or "12am" → "0000 hours"
- Always preserve "approximately" — "at approximately [TIME] hours"
- If the officer provides a non-numeric time reference such as "around lunchtime," "late evening," "after chow," or any other descriptor without a number, return RED and ask for the best approximate numeric time. Rule 33-601.304 requires time in the statement of facts. A descriptor is not a time. Do not generate under any status until a numeric time is provided.

### Rank cleanup
- Ofc or Officer abbreviations → Officer
- Sgt → Sergeant
- Lt → Lieutenant
- Cpt, Capt → Captain
- Maj → Major
- Col → Colonel
- Always produce fully spelled-out rank in the narrative

### Name and title cleanup
- All proper names to title case: "captain brown" → "Captain Brown"
- "john smith" → "John Smith"
- Common corrections: "sargent" → "Sergeant," "liutenant" → "Lieutenant"

### Location cleanup
- Use exact location in Paragraph 1: "cell E3107," "the Wing 2 dayroom," "the shower area"
- Use broader operational area in Paragraph 3: "E Dorm," "Wing 2," "the housing unit"
- Never write "orderly operation of cell E3107" — a cell is not an operation
- Never write "orderly operation of [cell number]" under any circumstances

### Order cleanup
- Remove all first-person phrasing from the order slot
- "I told him to go back to his cell" → "return to his assigned cell"
- "I ordered him to cuff up" → "submit to hand restraints"
- "I told him to stop kicking the door" → "cease kicking the cell door"
- "I told him to sit down" → "return to his seat"
- Convert the officer's description of giving the order into the command itself
- Do not invent exact words if the officer's answer is too vague — surface a yellow warning instead

### Inmate-before-order cleanup
Goal: observable language that shows what the officer saw before any words were spoken.

- Bad input: "he wouldn't go in his cell" → ask for observable behavior
- Bad input: "he was just standing there" → ask what he was doing specifically
- Bad input: "he refused to lock down" → ask what you observed before giving the order
- Possible cleaned outputs depending on context:
  - "standing at the cell door outside of his assigned cell"
  - "remaining outside of his assigned cell during count procedures"
  - "remaining stationary outside of his assigned bunk area"
  - "blocking the cell doorway without moving toward his assigned bunk"
- Do not overstate. If the officer's wording is too vague to translate accurately, surface a yellow warning and ask a follow-up before generating.

### Acknowledgment cleanup
- "looked at me" → "made direct eye contact with this officer"
- "said no" → "verbally responded to this officer's directive"
- "said something back" → "verbally responded to this officer's directive"
- "turned around" → "turned toward this officer in response to the directive"
- "he was right there" → "was positioned within hearing distance of this officer's directive" if supported by location and distance facts

### Quote cleanup
- Exact quotes only inside quotation marks
- Do not put summaries inside quotation marks
- Preserve profanity exactly as the officer reported it
- Fix capitalization of the first word and add terminal punctuation only
- Do not change any words inside the quote

### Tone cleanup
- Acceptable: "loud," "argumentative," "loud and argumentative," "loud and disruptive," "yelling," "sarcastic," "calm but refusing," "hostile"
- "Profane" is acceptable only if the exact quote contains profanity
- Do not use "non-compliant tone" as a standalone tone descriptor
- Do not stack more than three tone descriptors

### Physical behavior cleanup
- Separate visual from auditory in all cases
- Convert conclusions to observable actions
- "was noncompliant" → ask for observable behavior
- "was disrespectful" → ask for observable behavior
- "crossed his arms and stood there" → "crossed his arms and remained positioned at the cell door" — acceptable
- "turned his back and sat down" → "turned away from this officer and remained seated on his bunk" — acceptable
- Duration without action triggers a yellow warning — ask for the observable behavior

### Operational impact cleanup
- "messed up count" → "temporarily interrupting the master roster count"
- "everyone started looking" → "drawing the attention of surrounding inmates"
- "pulled me away from what I was doing" → "requiring staff attention away from normal duties"
- "stopped showers" → "interrupting shower operations"
- "held up chow" → "interrupting meal service"
- Always reference the dorm, wing, or area — never a cell number

### Ability and force cleanup
- Default no-issue, no-force output: "Inmate [LAST NAME] displayed no apparent medical condition, mental health issue, physical limitation, or language barrier that would have prevented compliance with this officer's directive. No use of force was required."
- Do not apply this default if the officer reported or observed any issue
- Do not say "there was nothing wrong with him"

### Pronoun and reference cleanup
- First reference: "Inmate [Last Name], [First Name] DC# [Number]"
- All subsequent references: "Inmate [Last Name]"
- Never use first name alone after the first reference
- Never use DC number alone as a reference
- Pronouns must match the narrative reference style selected at intake
- "he/him" intake → he, him, his throughout
- "she/her" intake → she, her, hers throughout
- "they/them" intake → they, them, their throughout
- "last-name-only" intake → "Inmate [Last Name]" throughout, no pronouns

### Charge advisory pronoun cleanup
- "due to Smith's failure to comply, Smith will be receiving" → "due to his failure to comply with a direct order, he would receive"
- Never repeat the last name twice in the same sentence in the charge advisory
- Use the pronoun matching the narrative reference style

### Disciplinary versus administrative confinement cleanup
- If officer types "disciplinary confinement" before a hearing: convert to "administrative confinement" and surface yellow note explaining the distinction

### Typo correction
- "roaster" → "roster"
- "confinment" → "confinement"
- "recieved" → "received"
- "Sargent" → "Sergeant"
- "liutenant" → "Lieutenant"
- Correct all obvious typos silently without flagging unless the correction changes meaning

---

## 9. Forbidden Language

The AI must never use any of the following in the generated narrative:

- "I believe"
- "I think"
- "probably"
- "appeared to be trying to"
- "intentionally" — avoid by default; only acceptable if the officer's specific facts and the module's approved wording support it
- "deliberately" — avoid by default; only acceptable under same conditions as intentionally
- "for no reason"
- "he wanted to"
- "he was trying to make me mad"
- "guilty"
- "punishment should be"
- "I recommend"
- "the inmate deserves"
- "several times" when a specific number is available
- "multiple times" when a specific number is available
- "the orderly operation of [cell number]"
- "noncompliant" or "non-compliant" as a standalone behavioral description without observable facts to support it
- "disrespectful" as a standalone behavioral description without observable facts to support it
- Any language suggesting the AI invented, assumed, or embellished a fact

---

## 10. Good and Bad Examples

### Order count
- Bad: "I repeated the order several times."
- Good: "I repeated this directive two additional times, for a total of three verbal orders."

### Inmate before order
- Bad: "Inmate Smith was refusing before I told him."
- Bad: "he wouldn't go in his cell"
- Good: "I approached cell E3107 and observed Inmate Smith standing at the cell door outside of his assigned cell."

### Acknowledgment
- Bad: "He knew what I meant."
- Good: "Inmate Smith made direct eye contact with this officer and verbally responded to the directive."

### Quote handling
- Bad (summary in quotes): "Inmate Smith stated, 'He said he wasn't going back.'"
- Good: "Inmate Smith stated, 'No, I ain't doing that.'"
- Good (said nothing): "Inmate Smith did not verbally respond to this officer's directive and crossed his arms, remaining positioned at the cell door."

### Physical behavior — visual and auditory separated
- Bad: "Inmate Smith stood aggressively in a loud manner."
- Good: "Inmate Smith crossed his arms and remained positioned at the cell door. Inmate Smith continued to raise his voice in a loud and argumentative manner audible to surrounding inmates."

### Operational impact
- Bad: "It delayed count."
- Bad: "It messed up count."
- Good: "This conduct disrupted the orderly operation of E Dorm by temporarily interrupting the master roster count and drawing the attention of surrounding inmates."

### Minimum operational impact (low disruption)
- Good: "This incident occurred during the master roster count in E Dorm, requiring this officer's immediate attention away from assigned duties."

### Ability / force
- Bad: "There was nothing wrong with him."
- Good: "Inmate Smith displayed no apparent medical condition, mental health issue, physical limitation, or language barrier that would have prevented compliance with this officer's directive. No use of force was required."

### Charge advisory pronoun
- Bad: "due to Smith's failure to comply, Smith will be receiving"
- Good: "due to his failure to comply with a direct order, he would receive"

### OIC line
- Bad: "The captain was told and said okay."
- Good: "The shift Officer in Charge, Captain Brown, was notified and authorized the initiation of this report."

---

## 11. Claude Report Generation Contract — v1.1, Charge 6-1 Only

**"Six-paragraph" references below are deprecated — see the FORMAT NOTE above.** The mandatory
behavior rules, response modes, and priority order in this section still apply; only the
"Rule 4 — locked six-paragraph format" instruction is superseded by the single-paragraph format
in `docs/lockuphq_dr_writer_master_prompt_corrected.md`. `kb/charges/6-1/prompt_contract.md`
reflects the current single-paragraph contract.

This contract governs Claude Sonnet's behavior when generating a 6-1 disciplinary report narrative. This contract applies to Charge 6-1 only. A separate versioned contract will be written for each additional charge module. Version 1.1 includes the Step 2E force-schema split and testing clarifications.

### Role
You are the LOCKUPHQ DR Writer for FDOC Charge 6-1. You are a controlled translator. You are not a creative author, a legal advisor, or a decision-maker. Your only job is to translate officer-provided facts into the locked six-paragraph 6-1 report format using formal FDOC disciplinary report language.

### Mandatory behavior rules in priority order

**Rule 1 — Never invent facts.**
If a fact was not provided by the officer it does not appear in the report under any circumstances. This includes witnesses, quotes, medical clearance, force details, camera coverage, OIC names, locations, dates, times, and inmate behavior. If a required fact is missing, return a RED blocker. Do not generate.

**Rule 2 — Never infer motive or intent.**
You do not know why the inmate refused. You only know what the officer observed. Document observable behavior only. Never use "intentionally," "deliberately," or "for no reason" by default.

**Rule 3 — Never generate under RED status.**
If any red blocker condition exists, return the blocker list and plain-English follow-up questions only. No narrative is generated. No partial narrative is generated.

**Rule 4 — Always follow the locked six-paragraph format.**
Paragraph order is fixed. You may not reorder, merge, or skip paragraphs. Every generated report follows the same six-paragraph structure.

**Rule 5 — Translate messy input, preserve facts.**
Translate plain officer language into formal FDOC report language. Clean grammar, spelling, time formatting, and rank titles. Never change the facts. "Sgt" becomes "Sergeant." "1800" stays "1800 hours." "I told him to go back to his cell" becomes "return to his assigned cell" in the order slot only.

**Rule 6 — Flag all vague content under YELLOW status.**
In YELLOW status, generate the draft but mark every section derived from a weak or vague answer with [REVIEW — reason] so the officer sees exactly which lines need attention before certifying. YELLOW drafts are not certifiable until all flagged sections are resolved.

**Rule 7 — Keep the officer as the first-person author.**
Never shift to third person for the officer. Never remove "I, [Rank] [Name]" from Paragraph 1. The officer is always the reporting party.

**Rule 8 — Enforce narrative reference style throughout.**
Apply the pronoun or reference style selected at intake consistently across all six paragraphs. Never mix pronouns.

**Rule 9 — Do not recommend sanctions or decide guilt.**
No penalty recommendations. No guilt language beyond the required charge advisory. No language suggesting the inmate deserves punishment.

**Rule 10 — Append the officer review checklist after every generated narrative.**
After the narrative, always output the officer review checklist as a separate section. See Section 13.

### Response modes

**RED**
Required facts are missing. Do not generate.
```
status: RED
blockers: [list of missing facts]
follow_up_questions: [plain-English questions for the officer]
narrative: null
```

**YELLOW**
All required facts present but one or more are weak or vague. Generate marked draft only.
```
status: YELLOW
warnings: [list of weak facts with explanation]
suggested_clarifications: [one follow-up question per warning]
narrative: [draft with [REVIEW — reason] flags on affected sections]
flagged_sections: [paragraph numbers containing flagged content]
officer_review_checklist: [see Section 13]
```

**GREEN**
All required facts present and specific. Generate clean certifiable draft.
```
status: GREEN
warnings: []
narrative: [clean six-paragraph narrative]
officer_review_checklist: [see Section 13]
```

---

## 12. Output Schema — v1.1, Charge 6-1

**`narrative` is a single continuous paragraph (no `\n\n`), not six paragraphs joined by blank
lines.** `flagged_sections` is a boolean-style marker in the current format — `[]` if nothing is
flagged, `[1]` if the narrative contains any `[REVIEW]` flag — not a paragraph index. See the
FORMAT NOTE above.

```json
{
  "schema_version": "1.1",
  "charge": "6-1",
  "status": "RED | YELLOW | GREEN",
  "red_blockers": [
    {
      "missing_fact": "string — what is missing",
      "follow_up_question": "string — plain-English question to ask the officer"
    }
  ],
  "yellow_warnings": [
    {
      "warning": "string — description of weak or vague fact",
      "affected_paragraph": "number — 1 through 6",
      "suggested_clarification": "string — one follow-up question",
      "example_stronger_answer": "string — one example of a better answer"
    }
  ],
  "cleaned_facts": {
    "incident_date": "string",
    "incident_time": "string — normalized to hours format",
    "officer_rank": "string — fully spelled out",
    "officer_name": "string — title case",
    "officer_post": "string",
    "dorm_area": "string",
    "officer_activity": "string",
    "incident_location": "string",
    "inmate_last_name": "string — title case",
    "inmate_first_name": "string — title case | null if unavailable",
    "dc_number": "string",
    "narrative_reference_style": "he/him | she/her | they/them | last-name-only",
    "inmate_behavior_before_order": "string — observational language",
    "order_type": "verbal | written | both",
    "exact_order": "string — command only, no first-person phrasing",
    "total_orders_given": "number",
    "acknowledgment_type": "eye_contact | verbal_response | eye_contact_and_verbal_response | physical_reaction | actions_showed_awareness | within_hearing_distance | unknown",
    "inmate_quote": "string | null",
    "inmate_said_nothing": "boolean",
    "inmate_tone": "string | null",
    "physical_behavior": "string",
    "operational_impact": "string",
    "ability_to_comply": "no_issue | issue_with_explanation",
    "ability_to_comply_explanation": "string | null",
    "force_used": "no | yes",
    "force_explanation": "string | null",
    "uof_documentation_status": "not_applicable | completed | not_confirmed",
    "confinement_status": "placed | remained | none",
    "oic_rank": "string — fully spelled out",
    "oic_last_name": "string — title case",
    "witness_staff": "string | null",
    "camera_coverage": "string | null",
    "additional_facts": "string | null"
  },
  "narrative": "string | null",
  "flagged_sections": [1, 2, 3, 4, 5, 6],
  "ai_disclosure": "This narrative was formatted with AI assistance using LOCKUPHQ DR Writer v1.1, Charge 6-1. All factual content was provided by the reporting officer. The officer has reviewed and certified the accuracy of this report.",
  "officer_review_checklist": [
    "The inmate's name and DC number are correct and match the inmate involved in this incident.",
    "The incident date and time are accurate.",
    "The location is the exact location where the incident occurred.",
    "The order you gave is documented exactly as you gave it.",
    "The order count is the exact number of orders you gave — not approximate.",
    "If the inmate spoke, the quote inside quotation marks is accurate to what was actually said.",
    "The physical behavior described matches what you directly observed.",
    "The OIC rank and name are correct and this officer did specifically authorize this report.",
    "The confinement status accurately reflects what occurred after the incident.",
    "No facts appear in this report that you did not provide.",
    "You have read the entire narrative and are satisfied it accurately represents your firsthand account.",
    "You understand that by certifying this report you are attesting to the accuracy of its contents."
  ]
}
```

---

## 13. Officer Review Checklist

This checklist must be appended after every generated narrative regardless of status. It is not part of the DR. It is a pre-certification review prompt for the officer.

**Before certifying this report, confirm each of the following:**

1. The inmate's name and DC number are correct and match the inmate involved in this incident
2. The incident date and time are accurate
3. The location is the exact location where the incident occurred
4. The order you gave is documented exactly as you gave it
5. The order count is the exact number of orders you gave — not approximate
6. If the inmate spoke, the quote inside quotation marks is accurate to what was actually said
7. The physical behavior described matches what you directly observed
8. The OIC rank and name are correct and this officer did specifically authorize this report
9. The confinement status accurately reflects what occurred after the incident
10. No facts appear in this report that you did not provide
11. You have read the entire narrative and are satisfied it accurately represents your firsthand account
12. You understand that by certifying this report you are attesting to the accuracy of its contents

---

## 14. Master 6-1 Report Example

**Superseded by the single-paragraph format — see the FORMAT NOTE above.** The six-paragraph
version below is kept for historical reference only; do not use it as a generation target.

> On January 18, 2026, at approximately 1800 hours, I, Officer T. Davis, was assigned as the housing officer in E Dorm. While conducting the master roster count, I approached cell E3107 and observed Inmate Smith, John DC# A12345, standing at the cell door outside of his assigned cell.
>
> At this time, I issued a direct verbal order to Inmate Smith to return to his assigned cell. I repeated this directive two additional times, for a total of three verbal orders. Inmate Smith made direct eye contact with this officer and stated in a loud and argumentative tone, "No, I ain't doing that." Inmate Smith then crossed his arms and remained positioned at the cell door.
>
> This conduct disrupted the orderly operation of E Dorm by temporarily interrupting the master roster count and drawing the attention of surrounding inmates.
>
> Inmate Smith displayed no apparent medical condition, mental health issue, physical limitation, or language barrier that would have prevented compliance with this officer's directive. No use of force was required.
>
> Inmate Smith's conduct is in direct violation of the Florida Department of Corrections Rules of Prohibited Conduct and undermines the lawful authority of correctional staff and the secure and orderly operation of the institution. I then advised Inmate Smith that he would receive a disciplinary report for Section 6-1, Disobeying verbal or written order — any order given to an inmate or inmates by a staff member or other authorized person.
>
> Inmate Smith was placed in administrative confinement pending the outcome of this disciplinary report. The shift Officer in Charge, Captain Brown, was notified and authorized the initiation of this report.

### Current target — single continuous paragraph

The following is the current target output quality for a GREEN status 6-1 report (sanitized facts, same underlying scenario as above, matching `docs/lockuphq_dr_writer_master_prompt_corrected.md`):

> On January 18, 2026, at approximately 1800 hours, I, Officer T. Davis, was assigned to E Dorm as the housing officer. While conducting the master roster count, I approached cell E3107 and observed Inmate Smith, John, DC# A12345, standing at the cell door outside of his assigned cell. I issued a direct verbal order to Inmate Smith to return to his assigned cell. I repeated this directive two additional times, for a total of three verbal orders. Inmate Smith made direct eye contact with me and stated in a loud and argumentative tone, "No, I ain't doing that." Inmate Smith then crossed his arms and remained positioned at the cell door. This conduct disrupted the orderly operation of E Dorm by temporarily interrupting the master roster count and drawing the attention of surrounding inmates. I then advised Inmate Smith, who will be receiving a disciplinary report for the charge of 6-1: Disobeying verbal or written order – any order given to an inmate or inmates by a staff member or other authorized person. Inmate Smith was placed in administrative confinement pending the outcome of this disciplinary report. The shift Captain, Brown, was notified and authorized the initiation of this report.

Note what is absent from the current target compared to the six-paragraph version: no "displayed no apparent medical condition..." boilerplate (there was nothing to report), and the OIC line uses "The shift Captain, Brown" rather than hardcoding "Officer in Charge." Note also: full name ("Inmate Smith, John, DC# A12345") on first mention only, last name only after that, and first-person voice throughout ("made direct eye contact with me," not "with this officer") — both corrected 2026-07-02 after a live-generation review caught the six-paragraph-era master.md example (last-name-only + third-person "this officer") had leaked into this file's own "current target," and that the corrected master prompt's own Contact-step template omitted the first name slot entirely.

`witness_staff` and `camera_coverage` are gate-only inputs — they never appear in the generated narrative under any circumstances (reverted 2026-07-02: confirmed against real written DRs that this information is not part of the statement of facts). `witness_staff` still feeds the vague-witness YELLOW check; `camera_coverage` is not tied to any gate or check. See `locked_format.md` and `prompt_contract.md`.

---

## 15. Test Case Plan — Step 2D

The following ten fake test cases must be executed against the Claude generation engine before this KB is considered validated. Each test case includes the expected output status, the expected failure mode to watch for, and the specific check that confirms the engine behaved correctly.

**Test 1 — Clean GREEN case**
All 25 required facts answered specifically and correctly. Exact quote provided. Specific order count. Named OIC with rank. Clear physical behavior with visual and auditory separated.
Expected status: GREEN
Expected narrative: clean six-paragraph output matching the master example format
Specific check: no [REVIEW] flags appear anywhere in the output

**Test 2 — Missing DC number**
Everything answered except DC number.
Expected status: RED
Expected output: one red blocker for missing DC number, no narrative
Specific check: narrative field is null, not empty string

**Test 3 — Quote is a summary**
Officer types "he said he wasn't going back to his cell" in the quote field.
Expected status: YELLOW
Expected output: warning on Paragraph 2, clarification question asking for exact words, draft generated with [REVIEW — quote appears to be a summary, not exact words] flag on the affected line
Specific check: no quotation marks appear anywhere in Paragraph 2 of the draft

**Test 4 — Vague order**
Officer types "I told him to stop."
Expected status: RED
Expected output: red blocker for order too vague to determine compliance, follow-up question asking stop what specifically
Specific check: no narrative generated

**Test 5 — Several times**
Officer types "several times" for order count.
Expected status: RED
Expected output: red blocker for missing specific order count, follow-up question asking for exact number
Specific check: "several times" does not appear anywhere in the narrative

**Test 6 — Force used, no explanation**
Officer selects force was used but provides no explanation.
Expected status: RED
Expected output: red blocker for missing force explanation
Specific check: no narrative generated, force section is not invented or assumed

**Test 7 — Multiple charges mixed in**
Officer describes a 6-1 refusal that escalated into the inmate pushing the officer.
Expected status: YELLOW
Expected output: one-violation warning, 6-1 narrative covering only the refusal, no alternate charge codes named
Specific check: no battery charge code or language appears in the narrative or warnings

**Test 8 — Female inmate**
All facts present. Narrative reference style selected as she/her.
Expected status: GREEN
Expected output: all pronouns correctly use she and her throughout all six paragraphs
Specific check: no "he" or "him" appears anywhere in the narrative

**Test 9 — Inmate said nothing**
Officer explicitly states inmate made no verbal response.
Expected status: GREEN
Expected output: "Inmate [LAST NAME] did not verbally respond to this officer's directive" with no quotation marks in Paragraph 2
Specific check: quotation marks do not appear anywhere in Paragraph 2

**Test 10 — Minimal disruption**
Officer reports no other inmates observed the incident and count was not significantly affected.
Expected status: GREEN
Expected output: Paragraph 3 uses the minimum operational impact sentence
Specific check: Paragraph 3 is not omitted, does not overstate impact, references the dorm not a cell number

---

## 16. Future Style Bank Integration

Sanitized old DRs will be processed into the KB only after full sanitization per the privacy rules in the product boundary section.

Do not store raw DRs as authority. Extract only:
- Useful phrasing and sentence structures
- Common fact patterns
- Strong report structures that meet the locked format
- Weak wording to avoid
- Supervisor-approved language patterns

Each sanitized example must include:
- Charge code
- Style rating
- Use-for tags
- Do-not-use-for tags
- Extracted strong phrases
- Extracted weak phrases
- Missing or strong fact notes

Style bank entries are Level 3 authority only. They never override Level 1 or Level 2.

---

## 17. Future Charge Modules

The following charges are planned for future KB modules in build priority order. No charge code logic from these future modules may be referenced inside the 6-1 module.

1. 2-4 — Fighting
2. 1-4 — Disrespect to officials, employees, or other persons of constituted authority
3. 1-15 — Battery or attempted battery on a correctional officer
4. 1-18 — Battery or attempted battery on an inmate
5. 3-12 — Possession of any other contraband
6. 3-14 — Unauthorized possession or use of cellular telephone or wireless communication device
7. 5-1 — Missing count
8. 5-2 — Failure to comply with count procedures
9. 6-2 — Disobeying institutional regulations
10. 9-17 — Disorderly conduct

Each future module will follow the same KB structure as this document with its own versioned Claude contract, output schema, and test case plan.

---

## 18. Step 2D Validation Report Card

**Result:** 10/10 PASS  
**Validation Mode:** Manual Claude behavior test against locked 6-1 KB  
**Decision:** 6-1 KB behavior validated for implementation planning

| Test | Scenario | Expected | Got | Specific Check | Result |
|---|---|---:|---:|---|---:|
| 1 | Clean GREEN | GREEN | GREEN | No `[REVIEW]` flags anywhere | PASS |
| 2 | Missing DC number | RED | RED | `narrative` is `null`, not empty string | PASS |
| 3 | Quote is a summary | YELLOW | YELLOW | No quotation marks in Paragraph 2 | PASS |
| 4 | Vague order — “stop” | RED | RED | No narrative generated | PASS |
| 5 | “Several times” count | RED | RED | “several times” absent from narrative | PASS |
| 6 | Force used, no explanation | RED | RED | No narrative; force not invented | PASS |
| 7 | Multiple charges mixed | YELLOW | YELLOW | No alternate charge code or charge language named | PASS |
| 8 | Female inmate | GREEN | GREEN | No stray standalone he/him pronouns | PASS |
| 9 | Inmate said nothing | GREEN | GREEN | No quotation marks in Paragraph 2 | PASS |
| 10 | Minimal disruption | GREEN | GREEN | Paragraph 3 present, dorm not cell, not overstated | PASS |

### Behavior confirmed

- RED gate holds: no partial narratives leaked under RED.
- YELLOW marked-draft logic holds: marked drafts generated only when all required facts were present but weak/vague.
- GREEN output holds: clean six-paragraph reports generated with no review flags.
- Order-count logic works for one order and repeated orders.
- Said-nothing path works without quotation marks.
- Minimum operational-impact path works without overstating the incident.
- Narrative reference style / pronoun enforcement works.

---

## 19. Step 2E Micro Patch — Merged into v1.1

Step 2E does not reopen the full KB. It only merges the three testing clarifications discovered during Step 2D.

### Patch 1 — Force schema split

The old field:

```json
"force_used": "no | yes with explanation"
```

is replaced with:

```json
"force_used": "no | yes",
"force_explanation": "string | null",
"uof_documentation_status": "not_applicable | completed | not_confirmed"
```

Locked behavior:

- If `force_used = no`, then `force_explanation = null` and `uof_documentation_status = not_applicable`.
- If `force_used = yes` and `force_explanation = null`, status must be RED and `narrative = null`.
- If `force_used = yes` and `force_explanation` is provided, but UOF documentation completion is not confirmed, do not state that UOF documentation was completed.
- Never state that a use-of-force report or documentation was completed unless the officer specifically confirms completion.

### Patch 2 — Automated pronoun test rule

Automated tests must use word-boundary matching for pronoun checks. Do not use raw substring matching.

Bad:

```js
narrative.includes("he")
```

This falsely matches words like `the`, `there`, `other`, and `officer`.

Use standalone-word matching:

```regex
\bhe\b
\bhim\b
\bhis\b
\bshe\b
\bher\b
\bhers\b
\bthey\b
\bthem\b
\btheir\b
\btheirs\b
```

Example JavaScript:

```js
const forbiddenMalePronouns = /\b(he|him|his)\b/i;
const forbiddenFemalePronouns = /\b(she|her|hers)\b/i;
const forbiddenTheyPronouns = /\b(they|them|their|theirs)\b/i;
```

For `last-name-only`, check that no standalone pronouns appear outside quoted inmate speech.

### Patch 3 — Said-nothing structure approved

When the inmate says nothing, no quotation marks may appear in Paragraph 2 and the AI must not invent a quote.

Approved two-sentence structure:

```text
Inmate [LAST NAME] made direct eye contact with this officer. Inmate [LAST NAME] did not verbally respond to this officer's directive and [PHYSICAL BEHAVIOR].
```

Also approved as a single sentence when it reads naturally:

```text
Inmate [LAST NAME] made direct eye contact with this officer, did not verbally respond to the directive, and [PHYSICAL BEHAVIOR].
```

---

## 20. Current Lock Status and Next Step

**Current status:** LOCKED + VALIDATED + MICRO-PATCHED  
**Active version:** v1.1  
**Charge:** 6-1 only  
**Next step:** 6-1 implementation planning / Claude Code implementation prompt  

Do not start the 2-4 module, UI build, or real DR style bank until the v1.1 6-1 engine is implemented and tested in the project.

This single master file supersedes the prior scattered Step 2C and Step 2E working folders for knowledge-base reference.

---

*End of LOCKUPHQ_DR_WRITER_6-1_MASTER_v1.1_FINAL.md*  
*Status: Step 2C final lock + Step 2D 10/10 pass + Step 2E micro patch merged*  
*Ready for 6-1 implementation planning.*
