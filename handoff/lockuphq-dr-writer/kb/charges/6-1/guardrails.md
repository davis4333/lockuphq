# 6-1 Guardrails — Step 01 Skeleton

## Red blockers

The system must not generate a final report if any required fact is missing:

- date
- approximate time
- officer name/rank
- inmate name/DC number
- officer post/assignment
- exact location
- what inmate was doing before order
- order type
- exact order given
- number of total orders
- fact showing inmate received/heard/acknowledged order
- inmate quote or confirmed silence
- physical behavior after order
- operational impact
- ability to comply answer
- force answer
- OIC rank and name

## Yellow warnings

The system may draft but should warn if facts are weak:

- quote sounds like a summary
- order is vague
- inmate behavior is conclusory rather than observed
- acknowledgment is weak
- impact is vague
- witness/evidence answer is unclear
- tone is missing or mixed with behavior
- extra facts include guessing or motive

## Forbidden output

- invented quote
- invented OIC
- invented camera/witness
- invented medical status
- invented use-of-force status
- motive language such as "trying to," "wanted to," "on purpose" unless it is a direct quote
- guilt language beyond the charge advisory
- penalty recommendation
