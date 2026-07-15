# 6-1 Locked Output Format

**Source of truth:** `docs/lockuphq_dr_writer_master_prompt_corrected.md`
(supersedes the six-paragraph version previously documented here — see
`kb/charges/6-1/master.md` FORMAT NOTE and `examples/6-1/notes/6-1_practice_example_analysis.md`
for the resolution history.)

Every Charge 6-1 report is ONE continuous paragraph. No section headers, no numbered
sections, no blank-line paragraph breaks. Target 100-200 words (real accepted range:
89-240, median 145). Facts change. Format does not.

Build the paragraph in this order, as continuous flowing prose:

1. **Opening / scene** — `On [DATE], at approximately [TIME], I, [RANK] [OFFICER NAME], was assigned to [DORM/AREA] as [POST/ASSIGNMENT]. While [OFFICER ACTIVITY], I approached [SPECIFIC LOCATION] and observed Inmate [LAST NAME], [FIRST NAME], DC# [DC NUMBER], [INMATE BEHAVIOR BEFORE ORDER].` Full name (last, then first) on this first mention only — every later reference in the narrative uses last name only ("Inmate [LAST NAME]"). If no first name is on file, drop it: `Inmate [LAST NAME], DC# [DC NUMBER], ...`
2. **Order, count, acknowledgment, response, physical behavior** — `I issued a direct [ORDER TYPE] order to Inmate [LAST NAME] to [EXACT ORDER]. [ORDER COUNT SENTENCE]. Inmate [LAST NAME] [ACKNOWLEDGMENT SENTENCE]. Inmate [LAST NAME] then stated, "[EXACT QUOTE]." Inmate [LAST NAME] then [PHYSICAL BEHAVIOR].` — if the inmate said nothing, no quotation marks anywhere in this portion.
3. **Operational impact — include only if a specific impact was reported** — `This conduct disrupted the orderly operation of [AREA] by [SPECIFIC OPERATIONAL IMPACT].` Omit this sentence entirely if nothing specific was reported; do not force a filler sentence.
4. **Ability to comply / force — include only if there is something to report** — omit the "no apparent medical condition..." boilerplate when there is no issue. Only state force-related facts the officer actually provided, and only state UOF documentation was completed if explicitly confirmed.
5. **Charge advisory** — `...will be receiving a disciplinary report for the charge of 6-1: Disobeying verbal or written order – any order given to an inmate or inmates by a staff member or other authorized person.` Use "will be receiving," not "would receive."
6. **Confinement and OIC close** — `[CONFINEMENT LINE IF APPLICABLE] The shift [OIC RANK], [OIC LAST NAME], was notified and authorized the initiation of this report.` Use the OIC's actual rank/title — do not hardcode "Officer in Charge."

The numbered items above are content-ordering steps within one paragraph, not separate
output paragraphs.

**Witness / camera coverage are gate-only inputs, never narrative content.** `witness_staff`
and `camera_coverage` are collected on the form but must never be composed into the generated
narrative — confirmed against real written DRs that this information does not appear in the
statement of facts. `witness_staff` still feeds the vague-witness YELLOW check in
`evaluate6_1.ts`; `camera_coverage` is not currently tied to any gate or check at all (2026-07-02
audit finding — flagged to Tyler as possibly worth dropping from the form).

**Point of view:** the whole narrative is written in the reporting officer's own first-person
voice — "I," "me," "my." Never refer to the officer in the third person (e.g. "this officer" /
"the officer") anywhere in the narrative, including in the inmate's acknowledgment/response
sentence — "Inmate [LAST NAME] made direct eye contact with me," not "...with this officer."
