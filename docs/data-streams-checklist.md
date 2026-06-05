# Data Streams Audit Checklist

Use this checklist for Chainlink Data Streams consumers and offchain relayers.

## Report Validation

- [ ] Report freshness is validated before use.
- [ ] Report schema and version are validated.
- [ ] Onchain verification is performed where required by the integration model.
- [ ] Duplicate reports are ignored or handled idempotently.
- [ ] Latency and staleness thresholds are monitored.

## Relayer And Client Operations

- [ ] WebSocket reconnect and failover behavior is implemented.
- [ ] Client handles partial outages and backoff safely.
- [ ] Credentials and secrets are not committed, logged, or exposed to frontend clients.
- [ ] Report delivery failures fail closed for critical protocol actions.
- [ ] Monitoring alerts cover delayed, missing, or invalid reports.
