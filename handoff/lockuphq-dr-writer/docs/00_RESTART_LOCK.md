# 00 — Restart Lock

We are restarting the DR Writer build cleanly.

## What we are keeping

- Charge-by-charge development.
- 6-1 first.
- Locked six-paragraph output format.
- Green / yellow / red gate concept.
- Plain-English officer intake.
- Officer remains author/reviewer.

## What we are scrapping

- Dropdown-heavy intake.
- Static HTML template as the real report writer.
- Trying to perfect narrative quality before the knowledge base is locked.
- Building UI before the engine is correct.

## Correct product architecture

```text
Officer answers plain-English questions
        ↓
Knowledge base checks facts and rules
        ↓
Red / yellow / green gate
        ↓
Claude writes using locked format and guardrails
        ↓
Knowledge base checks Claude output
        ↓
Officer reviews, edits, and certifies
```

## Non-negotiable rule

The AI cannot invent facts. Missing required facts create a red blocker.
