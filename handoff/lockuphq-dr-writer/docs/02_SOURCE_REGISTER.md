# 02 — Source Register

The source register tracks every rule, policy, form, and local standard used by the knowledge base.

## Source classes

### Official rule source

Used for version and rule identity.

Examples:
- Florida Administrative Rules / FLRules gateway.
- Florida Department of State Administrative Code and Register.

### Readable rule mirror

Used to quickly read and quote rule text where the official site is difficult to parse.

Examples:
- Cornell Legal Information Institute.
- Justia Regulations.

### Internal/local source

Used later for facility-specific preferences, supervisor feedback, and approved wording. These should be clearly labeled as local practice, not statewide law.

## Rule for using sources

If a rule controls a guardrail, the KB entry must identify:

- source id
- rule number
- rule title
- source type
- current/checked date
- exact KB claim supported by the source
- whether the source is official or readable mirror

## First source set

See `kb/common/source_register.json`.
