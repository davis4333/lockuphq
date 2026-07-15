# LOCKUPHQ DR Writer
## Adaptive Incident Intake and Narrative System
### Frozen Master Blueprint v2.5 — Post-Review

**Status:** Ready for policy-registry, state-machine, and automated-test-harness implementation  
**Not authorized for:** Production use, real inmate data, live AI drafting, or officer-facing deployment

---

# 1. Executive architecture

LOCKUPHQ DR Writer will use an adaptive, fact-led workflow rather than a rigid incident questionnaire.

The officer enters standardized administrative information and then describes the incident naturally. AI extracts atomic facts but does not draft the disciplinary narrative or decide whether a charge is supported. A deterministic, versioned charge packet evaluates officer-confirmed facts. The application asks only approved, neutral questions required to resolve missing, vague, conflicting, or unsupported information.

A narrative may be generated only from an immutable, officer-confirmed fact snapshot. Every narrative sentence must map to confirmed fact IDs. Deterministic and semantic validators must pass. Officer certification, append-only audit completion, and a short-lived finalization token are required before any final output.

The application must fail closed.

---

# 2. Product role and limitations

The system assists with:

- Organizing messy incident notes.
- Separating people, orders, statements, and events.
- Identifying charge-relevant facts.
- Asking neutral follow-up questions.
- Exposing contradictions and uncertainty.
- Producing professional language from confirmed facts.
- Checking narrative fidelity.
- Maintaining traceability and audit history.

The system does not:

- Decide guilt.
- Determine punishment.
- Decide whether an order was lawful.
- Invent or complete missing facts.
- Infer intent without a supported source.
- Select or recommend a different charge.
- Combine separate directives to strengthen an allegation.
- Convert summaries into quotations.
- Make medical, mental-health, legal, or policy conclusions.
- Replace the reporting officer, supervisor, hearing team, agency policy, or legal process.
- Guarantee report acceptance or hearing outcome.

The reporting officer remains responsible for factual accuracy. The reviewing chain remains responsible for policy compliance and submission.

---

# 3. Non-negotiable invariants

1. No material narrative fact without a valid source.
2. No final narrative sentence without supporting confirmed fact IDs.
3. No final narrative while required facts are unresolved.
4. No policy-sensitive incident marked ready without approved resolution.
5. No report finalized against stale facts, notes, amendments, narrative, validation, policy, charge, schema, prompt, model, role, or session state.
6. No output before officer certification.
7. No output before append-only audit commit.
8. No output path outside centralized server-side authorization.
9. Original notes are immutable after atomic commit.
10. Amendments never overwrite original notes.
11. Every post-extraction amendment triggers re-extraction and downstream invalidation.
12. AI may return `CANNOT_DETERMINE`.
13. Independent gates remain separately stored and simultaneously visible.
14. Factual changes invalidate every dependent stage.
15. Narrative edits require constrained re-sourcing and revalidation.
16. Review drafts are visibly nonfinal and never receive final-report controls.
17. Incident notes are untrusted data, not instructions.
18. No human override can bypass missing facts, failed sourcing, validation failure, or audit failure.
19. Policy resolutions are attributable, versioned, and auditable.
20. Complete facts that contradict the selected charge produce `CHARGE UNSUPPORTED`, not another question loop.
21. Fact confirmation and certification are hash-bound.
22. Finalization tokens are session-bound, channel-bound, single-use, short-lived, and revocable.
23. Audit commit, token issuance, and output redemption occur in that order.
24. Concurrency conflicts never auto-merge.
25. Model agreement is never treated as factual confirmation.
26. A false block is safer than a false ready-state.

---

# 4. Requirement hierarchy

Every enforced rule belongs to one category.

## Tier 1 — Official rule requirements

Official requirements must have:

- Approved source.
- Effective date.
- Jurisdiction.
- Version.
- Requirement mapping.
- Conflict status.

Unsourced Tier 1 requirements cannot deploy as hard blockers.

## Tier 2 — Approved agency or institutional procedure

Examples may include supervisor approval, notifications, issuer authority, force procedures, medical procedures, local form requirements, and retention.

Unverified Tier 2 issues route to policy review.

## Tier 3 — Charge-specific factual grounding

For Charge 6-1, the configurable packet may require:

- Subject identity.
- Issuer identity.
- Authority basis.
- Specific order.
- Applicability to the subject.
- Post-order conduct.
- Supported noncompliance.
- Immediate action.
- Material-source attribution.
- Contradiction resolution.
- Selection of one charge-supporting order event.

Tier 3 establishes factual grounding, not guilt.

## Tier 4 — Quality and review safeguards

Examples:

- Exact versus approximate time.
- Exact versus summarized statement.
- Exact versus minimum-known order count.
- Awareness details.
- Opportunity details.
- Operational context.
- Minor discrepancy.
- Rapid-confirmation warning.

## Tier 5 — Style preferences

Examples:

- Six logical narrative sections.
- Last-name-only style.
- Tone and transitions.
- Preferred wording.

Style cannot determine readiness.

## Tier 6 — Product and technical controls

Examples:

- Authentication.
- Version control.
- Hash binding.
- Audit commit.
- Finalization token.
- Output authorization.
- Concurrency control.
- Kill switch.

---

# 5. Core entities

## 5.1 Person registry

Every person receives a stable `person_id`.

Fields:

- person_id
- report_id or incident_group_id
- person_type: staff, inmate, medical_staff, witness, unknown
- first_name
- last_name
- initial
- rank_or_role
- DC_number where applicable
- identity_source
- confirmation_status
- ambiguity_status

All fact speakers, subjects, witnesses, and order issuers reference `person_id`, not free-text names.

Ambiguous references create `ambiguous_person_reference`.

## 5.2 Incident group

A shared incident involving multiple subject inmates may create linked sibling workspaces.

Fields:

- incident_group_id
- shared_scene_facts
- shared_staff
- shared_date_time_location
- sibling_report_ids
- creation_source
- created_by

Each sibling report contains one subject inmate and its own subject-specific facts, order applicability, statements, conduct, confirmation, narrative, validation, and certification.

Shared scene facts may be reused through the incident group. Subject-specific facts may not.

## 5.3 Report lifecycle

Lifecycle values:

- DRAFT
- ABANDONED
- EXPIRED
- FINALIZED
- VOIDED

Retention and transition permissions are policy-configured and audited.

## 5.4 Independent gates

- system_gate
- procedural_gate
- policy_gate
- fact_gate
- quality_gate
- narrative_gate
- certification_gate
- audit_gate

A derived display status is never the source of truth.

---

# 6. Display statuses

## SYSTEM HOLD

Technical, version, concurrency, session, kill-switch, or audit failure.

## PROCEDURAL REVIEW

A procedural prerequisite or mandatory coordination is unresolved.

## POLICY REVIEW

Complete or partially complete facts require an authorized policy determination.

## FACTS INCOMPLETE

Required facts are missing, vague, contradictory, unattributed, unconfirmed, or unsupported.

## CHARGE UNSUPPORTED

The confirmed facts are complete enough to evaluate and affirmatively fail the selected charge's configured factual-grounding rules.

Behavior:

- Block narrative generation.
- Explain which configured grounding rule was not satisfied.
- Never recommend another charge.
- Permit factual amendment, policy review where applicable, or workspace closure.
- Do not restart clarification unless a fact actually changes.

## REVIEW REQUIRED

Hard requirements pass, but quality warnings remain.

## READY FOR GENERATION

All pre-generation gates pass.

## VALIDATION HOLD

Generated or edited narrative failed sourcing or validation.

## READY FOR CERTIFICATION

Current narrative passed validation, but current officer certification is absent.

## FINALIZED

Current certification, audit, and valid output authorization exist for the exact current hashes.

---

# 7. End-to-end workflow

## Stage 1 — Secure workspace

Server verifies:

- User authentication.
- Role authorization.
- Session validity.
- Institution profile.
- Charge packet.
- Policy profile.
- Schema.
- Approved model/prompt/validator versions.
- Kill-switch state.
- Current report version.
- Cross-user isolation.
- Concurrency state.

## Stage 2 — Administrative intake

Capture:

- Reporting officer person ID.
- Institution and assignment.
- Subject inmate person ID and DC number.
- Full incident start datetime.
- Optional incident end datetime.
- Time certainty.
- General area.
- Specific location.
- Selected charge.
- Reference style.
- Optional incident_group_id.

The displayed report date is derived by a versioned policy rule. Midnight crossover cannot be guessed by AI.

## Stage 3 — Procedural screen

Ask only source-backed questions.

Procedural answers are later cross-checked against extracted notes. A conflict between the screen and extracted facts creates procedural review.

## Stage 4 — Atomic original-notes commit

The original notes are saved atomically and become immutable.

Store:

- Original text.
- Hash.
- Author.
- Timestamp.
- Request ID.
- Encoding and length.
- Truncation status.

Silent truncation is prohibited.

## Stage 5 — Amendments

An amendment is a separate immutable record.

Any amendment after extraction:

1. Invalidates the extraction critic's prior completeness judgment.
2. Runs extraction against the amendment.
3. Reconciles amendment facts with the ledger.
4. Triggers factual rollback.

Any amendment after snapshot additionally invalidates:

- Snapshot.
- Narrative.
- Source map.
- Both validations.
- Certification.
- Audit finalization.
- Finalization token.

## Stage 6 — Atomic fact extraction

Extractor output is schema-constrained.

Allowed outcomes:

- Facts.
- Ambiguities.
- Potential contradictions.
- `injection_suspected`.
- `CANNOT_DETERMINE`.

It may not write narrative prose or create missing facts.

Malformed or partial output receives at most two idempotent retries, then SYSTEM HOLD.

## Stage 7 — Extraction critic

Use a separately configured critic prompt and, where practical, different model configuration.

Critic checks:

- Omitted facts.
- Added facts.
- Negation.
- Attribution.
- Identity.
- Order separation.
- Chronology.
- Certainty.
- Corrections.
- Procedural-screen conflicts.

Critic agreement never confirms a fact. Only officer confirmation can do that.

## Stage 8 — Person disambiguation

Resolve all ambiguous people before charge-critical facts can be confirmed.

The officer selects or creates the correct person registry entry.

Same-last-name cases cannot continue with a bare string such as "Smith."

## Stage 9 — Append-only fact ledger

Each fact includes:

- fact_id
- report_id
- category
- structured value
- certainty
- source_type
- source_record_id
- exact source passage
- speaker_person_id
- subject_person_id
- sequence
- extraction status
- confirmation status
- prior fact version
- created version
- modified version

Corrections create new versions.

## Stage 10 — Order-event normalization

Each distinct directive receives an order event.

Fields:

- order_event_id
- issuer_person_id
- issuer_role_source
- authority_status
- authority_source
- order_type
- specific_command
- delivery_scope
- subject_applicability
- first_delivery_datetime
- count_mode: exact, at_least, unknown
- exact_count
- minimum_count
- modification
- rescission
- conflicting_orders
- awareness_basis
- opportunity
- verbal_response_type
- verbal_response
- physical_response
- compliance_result
- compliance_timing
- selected_for_charge

Different commands cannot be treated as repetitions.

## Stage 11 — Conditional branches

Activate source-backed branches for:

- Medical/infirmary.
- Mental-health/care plan.
- Written order.
- Group order.
- Force.
- Delayed compliance.
- Partial compliance.
- Multiple staff.
- Multiple inmates.
- Secondhand information.
- Possible criminal conduct.
- Possible self-injury.

AI never resolves policy conflicts.

## Stage 12 — Cross-consistency checks

Deterministically compare:

- Procedural screen versus extracted notes.
- Administrative identity versus note identity.
- DC number versus subject references.
- Incident group versus sibling-subject facts.
- Force answers versus extracted force facts.
- Medical answers versus extracted medical facts.

Conflicts route to the appropriate gate.

## Stage 13 — Deterministic charge evaluation

The charge packet may return:

- FACTS_INCOMPLETE
- POLICY_REVIEW
- CHARGE_UNSUPPORTED
- REVIEW_REQUIRED
- READY_FOR_GENERATION

The packet contains `charge_unsupported_rules` for conditions such as timely compliance, rescission before the alleged conduct, or other source-backed defeating facts.

It never recommends a different charge.

## Stage 14 — Controlled adaptive questions

AI does not freely author questions.

The engine selects approved question intents and fills safe ledger slots.

Default configuration:

- Batch size: 4.
- Maximum batch size: 5.
- Maximum automated clarification rounds: 3.

Every applicable question supports:

- Exact.
- Approximate.
- Did not observe.
- Do not remember.
- Unknown.
- Not applicable.

After the limit, unresolved items move to manual fact review.

## Stage 15 — Officer fact confirmation

Charge-critical items are confirmed individually.

Confirmation events store:

- confirmation_event_id
- user_id
- ledger_hash_shown
- fact IDs shown
- fact versions shown
- per-fact decisions
- timestamps
- rapid-confirmation indicators
- source passages shown

Adaptive friction:

- No blanket artificial delay.
- If rapid or low-deliberation behavior is detected, re-display the source and require a second explicit confirmation.
- Record the warning in audit.
- Never silently confirm on behalf of the officer.

## Stage 16 — Immutable fact snapshot

Snapshot contains:

- Administrative hash.
- Confirmed ledger hash.
- Selected-order hash.
- Original-notes hash.
- Ordered amendment hashes.
- Person-registry hash.
- Incident-group shared-fact hash where applicable.
- Charge packet version.
- Policy version.
- Schema version.
- Model and prompt versions.
- Officer confirmation event ID.

## Stage 17 — Narrative generation

Generator receives only the snapshot and approved configuration.

Each sentence returns:

- sentence_id
- section
- text
- source_fact_ids
- certainty

No source IDs means rejection.

## Stage 18 — Deterministic validation

Checks include:

- Identity and DC number.
- Datetime and location.
- One violation.
- Selected order and issuer.
- Subject applicability.
- Certainty wording.
- Immediate action.
- Conditional fields.
- Sentence-source existence.
- Version/hash consistency.
- Forbidden conclusions.
- Placeholders.
- Exact-quote containment.

Exact quotation rule:

The quoted string must appear verbatim in the cited source passage. Otherwise it is rejected or converted through the factual-edit path to a summary.

## Stage 19 — Semantic validation

Checks:

- Added or omitted facts.
- Meaning changes.
- Wrong person.
- Wrong order.
- Wrong chronology.
- Unsupported medical conclusion.
- Operational exaggeration.
- Intent.
- Guilt or punishment.
- Unsupported certainty.
- Force inconsistency.

The validator cannot silently repair and approve its own change.

Maximum automated regeneration/revalidation attempts: 2.

After two failed attempts, remain in VALIDATION HOLD and require officer resolution.

## Stage 20 — Officer narrative editing and constrained re-sourcing

A narrative-only edit invalidates:

- Sentence-source mapping.
- Deterministic validation.
- Semantic validation.
- Certification.
- Audit finalization.
- Token.

Edited sentences enter a constrained re-sourcing process.

The only allowed outputs are:

- Existing confirmed fact IDs.
- `UNSUPPORTED`.

The re-sourcing model cannot create facts or free-text explanations.

If `UNSUPPORTED`, the officer must:

1. Revert the sentence.
2. Restate the sentence.
3. Add/correct the underlying fact through the factual-edit path.

Maximum failed re-sourcing attempts for the same sentence: 2. Then force manual fact review.

## Stage 21 — Rollback dependency rules

### Trigger A — Administrative or factual change

Includes:

- Administrative edit.
- Fact correction.
- New amendment after extraction.
- Person identity correction.
- Selected-order change.
- Incident-group shared-fact change.

Rollback to charge evaluation and invalidate all downstream artifacts.

### Trigger B — Narrative-only edit

Rollback to re-sourcing and both validators.

### Trigger C — Version, policy, kill-switch, session, or concurrency event

SYSTEM HOLD until compatibility or current-state recovery.

### Trigger D — CHARGE UNSUPPORTED

Terminal for the selected charge unless a fact changes or the workspace closes.

## Stage 22 — Officer review and certification

Certification request includes:

- user_id
- session_id
- report_version
- fact_snapshot_hash
- narrative_hash
- deterministic_validation_id
- semantic_validation_id

The server rejects certification if any value differs from current state.

Certification creates a separate immutable record.

## Stage 23 — Audit commit

Audit events include:

- workspace_created
- original_notes_committed
- amendment_added
- extraction_started/completed/failed
- critic_completed
- person_disambiguated
- facts_confirmed
- snapshot_created
- policy_review_resolved
- charge_unsupported
- narrative_generated
- narrative_edited
- validation_completed/failed
- certification_created/rejected
- session_locked
- session_lock_transferred
- concurrency_rejected
- kill_switch_engaged/released
- review_draft_viewed
- token_issued
- token_redeemed
- token_revoked
- output_completed/failed
- report_abandoned/expired/voided

Audit-reader roles and retention are policy-configured.

## Stage 24 — Finalization token and v1 output

Server issues a token only after the audit finalization row commits.

Token fields:

- token_id
- report_id
- user_id
- role
- session_id
- report_version
- fact_snapshot_hash
- narrative_hash
- validation hashes
- charge/policy/schema versions
- output_channel
- issued_at
- expires_at
- single_use
- redeemed_at
- revoked_at

Default expiry: 5 minutes, configurable.

V1 output channels:

- Copy final narrative.
- Print.
- PDF.

Email, browser share, DOCX, general download, and API output are out of v1 scope.

Token redemption is server-side, single-use, channel-specific, and separately audited.

---

# 8. Review drafts

Review drafts:

- Display inline textual watermarking between sections.
- State `REVIEW DRAFT — NOT A DISCIPLINARY REPORT`.
- Have no final-output buttons.
- Exclude final certification language.
- Log draft views.

Text selection and screenshots cannot be fully prevented. The product must not claim otherwise.

---

# 9. Concurrency, sessions, and recovery

Use optimistic concurrency.

Every commit requires the current monotonic `report_version`.

A stale write is rejected. The user reloads the latest committed state. No automatic merge.

Session-lock transfer is an explicit audited action.

Atomic stage commits and idempotency keys are required.

A crash resumes from the last completed commit.

Partial AI or database output is never promoted.

Failed output does not mark output complete.

---

# 10. Kill switch

The kill switch is server-side.

Authorized roles are policy-configured.

When engaged:

- All open reports enter SYSTEM HOLD.
- Token issuance stops.
- Output authorization rejects all requests.
- Existing unused tokens are revoked.
- Current committed work remains preserved.
- Engagement and release are audited.
- Resumption requires current-version compatibility checks.

A client-side flag is insufficient.

---

# 11. Policy traceability

Every Tier 1 and Tier 2 control requires a registry record.

Deployment must fail when a hard blocker is:

- Unsourced.
- Unapproved.
- Not effective for the incident date.
- Conflicted.
- Overridden by an unapproved local rule.

Until verified, policy questions remain review triggers or quality safeguards.

---

# 12. Security and privacy

Required:

- Agency-approved hosting and AI data path.
- Encryption in transit and at rest.
- No real data in public demo mode.
- Role-based access.
- Cross-user and cross-report isolation.
- No raw incident notes in telemetry.
- No credentials in browser code.
- Session expiration and screen locking.
- Audit-reader access control.
- Policy-configured retention.
- Medical-information minimization in the narrative.
- Secure deletion under approved policy.
- Prompt-injection containment.
- No silent model or prompt updates.
- Rate limits and abuse controls.
- Environment separation.
- Key rotation.
- Backup and restore testing.

The audit may contain source facts needed for accountability. Its access and retention must be stricter than ordinary application logs.

---

# 13. Minimum schemas

## Person

- person_id
- person_type
- first_name
- last_name
- initial
- role
- DC_number
- identity_source
- confirmation_status
- ambiguity_status

## Report workspace

- report_id
- incident_group_id
- lifecycle
- report_version
- owner_user_id
- institution_id
- subject_person_id
- charge_code
- independent gates
- derived status
- current version references
- created_at
- updated_at

## Raw notes

- raw_notes_id
- report_id
- original_text
- committed_hash
- created_by
- created_at
- immutable

## Amendment

- amendment_id
- report_id
- amendment_text
- amendment_hash
- reason
- created_by
- created_at
- rollback_triggered_at

## Fact

- fact_id
- report_id
- category
- value
- certainty
- source_type
- source_record_id
- source_text
- speaker_person_id
- subject_person_id
- sequence
- extraction_status
- confirmation_status
- prior_fact_version
- created_version
- modified_version

## Fact confirmation event

- confirmation_event_id
- report_id
- user_id
- ledger_hash
- displayed_fact_versions
- decisions
- source_passages_shown
- timing_metadata
- created_at

## Fact snapshot

- snapshot_id
- report_id
- report_version
- administrative_hash
- ledger_hash
- raw_notes_hash
- amendment_hashes
- person_registry_hash
- incident_group_hash
- charge_version
- policy_version
- schema_version
- model_prompt_versions
- confirmation_event_id
- created_at

## Order event

As defined in Stage 10.

## Charge packet

Add:

- charge_unsupported_rules
- source mappings
- acceptable source types
- issuer authority rules
- question intents
- validation rules
- effective dates
- approval metadata

## Validation issue

- issue_id
- severity: blocker, warning, info
- category
- sentence_id
- fact_ids
- message
- resolver
- resolution
- created_at
- resolved_at

## Certification

- certification_id
- report_id
- user_id
- session_id
- report_version
- fact_snapshot_hash
- narrative_hash
- validation_ids
- created_at

## Finalization token

As defined in Stage 24.

---

# 14. Testing before UI or AI integration

The executable state machine must pass:

1. Amendment-triggered rollback at every workflow stage.
2. Narrative re-sourcing to existing facts only.
3. `UNSUPPORTED` edited sentence handling.
4. Two-attempt re-sourcing limit.
5. CHARGE UNSUPPORTED terminal behavior.
6. Person ambiguity with same last names.
7. Incident-group sibling behavior.
8. Subject-specific paste checks.
9. Hash-bound fact confirmation.
10. Hash-bound certification rejection on stale views.
11. Quote-containment checks.
12. Procedural-screen versus notes conflicts.
13. Audit-before-token ordering.
14. Session-bound token.
15. Single-use token.
16. Token expiry and revocation.
17. Output-channel binding.
18. Report-version stale-write rejection at every stage.
19. Session-lock transfer.
20. Kill-switch activation and recovery.
21. Lifecycle transitions.
22. Abandonment and expiry rules.
23. Validation retry bounds.
24. Midnight-crossover data handling.
25. Deployment failure for unsourced hard blockers.

No UI and no real model are required for these tests.

---

# 15. AI benchmark requirements

Before officer UI development, actual selected models must pass a gold-standard synthetic benchmark.

Critical release failures:

- Invented material fact.
- Wrong subject.
- Wrong DC number.
- Wrong speaker.
- Wrong issuer.
- Different orders combined.
- Negation reversed.
- Summary converted to quote.
- Unsupported medical conclusion.
- Prompt injection followed.
- Policy review converted to readiness.
- Unsupported sentence passing re-sourcing.
- Charge-unsupported facts classified as ready.

One critical failure blocks progression.

---

# 16. Human usability benchmark

Before live pilot:

- Routine straightforward case target: 8 minutes or less end to end.
- Measure abandonment rate.
- Measure unnecessary-question rate.
- Measure officer correction rate.
- Seed extraction errors and measure officer detection.
- Seed narrative errors and measure supervisor detection.
- Test multi-inmate sibling workflow.
- Test shared-terminal session behavior.
- Test shift change and resume.
- Test overnight/midnight incidents.

The eight-minute target is a usability target, not a legal requirement.

---

# 17. Design-analysis coverage

Pre-code design analysis included directed scenarios, fault combinations, policy mutations, misuse cases, recovery boundaries, output-gate checks, and randomized state combinations.

No software, model, browser, database, authentication system, or production export was tested.

No result in this section may be cited as evidence that an implemented system is safe, accurate, legally compliant, or production-ready.

---

# 18. Build order

## Phase 1 — Policy registry and schemas

Build only:

- Requirement registry.
- Source registry.
- Charge packet schema.
- Policy profile schema.
- Person registry.
- Incident group.
- Lifecycle.
- Fact and event schemas.

## Phase 2 — State machine

Build:

- Independent gates.
- Derived statuses.
- Rollback dependency graph.
- CHARGE UNSUPPORTED.
- Optimistic concurrency.
- Atomic stage commits.
- Kill switch.
- Audit-before-token ordering.
- Finalization-token stub.
- Central output-authorization stub.

## Phase 3 — Automated test harness

Build:

- Synthetic incident format.
- Expected state transitions.
- Fault injection.
- Policy mutation tests.
- Hash mismatch tests.
- Concurrency tests.
- Token tests.
- Amendment tests.
- Re-sourcing tests.

## Phase 4 — Extraction benchmark

Only after Phases 1–3 pass:

- Connect the selected extraction model.
- Add the critic.
- Score against gold-standard facts.

## Phase 5 — Adaptive questions

Only approved intent templates.

## Phase 6 — Narrative and validation

Sentence sourcing, deterministic validator, semantic validator, constrained re-sourcing.

## Phase 7 — Persistence and security integration

Authentication, authorization, audit, recovery, retention, output authorization.

## Phase 8 — Officer UI

Only after engine and benchmarks pass.

## Phase 9 — Shadow pilot

Synthetic or approved de-identified incidents only.

## Phase 10 — Controlled live pilot

Limited users, mandatory supervisor review, frozen versions, full logging, kill switch, no automatic submission.

---

# 19. Definition of ready for Claude Code

Claude Code may begin only when:

- This v2.5 blueprint is the active source of truth.
- Policy registry records exist or unresolved items are explicitly nonblocking.
- Claude Code is instructed not to build UI or connect real AI yet.
- State-machine acceptance tests are listed.
- Existing project behavior and tests are preserved.
- No real inmate data is used.
- Work is performed in staged, reviewable commits or checkpoints.
