# Functions / CRE Audit Checklist

Chainlink Functions sunset and migration considerations should be reviewed for any existing Functions integration. New designs should evaluate Chainlink Runtime Environment (CRE) guidance and current Chainlink documentation before implementation.

## Functions Legacy Review

- [ ] Migration or sunset considerations are documented.
- [ ] Secrets are not stored onchain, committed to source control, or logged.
- [ ] External API rate limits, quotas, and failure modes are documented.
- [ ] Timeouts and error responses are handled explicitly.
- [ ] Offchain computation assumptions are deterministic enough for the use case.
- [ ] Simulation tests cover successful and failed responses.

## CRE Readiness

- [ ] Migration path from Functions to CRE is documented where relevant.
- [ ] Trust boundaries between onchain contracts, DON execution, and external APIs are clear.
- [ ] Response schema, versioning, and validation are explicit.
- [ ] Operational monitoring covers API failures and delayed responses.
