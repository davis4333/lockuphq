# 03 — Knowledge Base Architecture

## Common KB

Shared across all charge modules.

Examples:
- global no-invention rule
- report style rules
- forbidden language
- source register
- Chapter 33 discipline baseline
- officer certification rule

## Charge KB

Each charge gets its own isolated module.

Example:

```text
kb/charges/6-1/
  charge_skeleton.json
  locked_format.md
  guardrails.md
  gate_rules_skeleton.json
  claude_contract_skeleton.json
```

## Why charge isolation matters

Do not build one giant general-purpose DR writer. Each charge has different required facts, dismissal risks, and narrative structure.

The 6-1 module knows only 6-1.

## Engine responsibilities

### Knowledge base

- tells Claude what the charge requires
- blocks missing facts
- warns on weak facts
- forbids invented details
- defines the locked output format

### Claude

- translates plain English into professional narrative
- follows the locked format
- uses only officer-provided facts
- returns blockers if facts are missing

### App

- collects intake answers
- runs gate
- sends structured prompt to Claude
- displays final report for review
