# Automation Audit Checklist

Use this checklist for Chainlink Automation-compatible contracts.

## Check And Perform Consistency

- [ ] `performUpkeep` revalidates all conditions checked by `checkUpkeep`.
- [ ] Stale `performData` cannot trigger unintended state changes.
- [ ] Tests cover valid, invalid, and stale `performData`.
- [ ] `checkUpkeep` and `performUpkeep` agree on encoding and assumptions.

## Access And Failure Modes

- [ ] Forwarder assumptions are documented.
- [ ] Access control is explicit where only Automation should execute.
- [ ] Pause or emergency path exists for critical upkeeps.
- [ ] Gas-heavy work is bounded or chunked.
- [ ] Billing and funding assumptions are documented.

## Operations

- [ ] Upkeep frequency and trigger conditions are documented.
- [ ] Missed upkeep behavior is safe.
- [ ] Repeated perform attempts are idempotent or revert safely.
