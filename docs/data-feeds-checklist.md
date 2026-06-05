# Data Feeds Audit Checklist

Use this checklist for contracts consuming Chainlink Data Feeds through `AggregatorV3Interface`.

## Required Validation

- [ ] `latestRoundData()` result validates `answer > 0`.
- [ ] `updatedAt != 0` is required before using the answer.
- [ ] Staleness is bounded with a feed-specific threshold, for example `block.timestamp - updatedAt <= maxStaleness`.
- [ ] `answeredInRound` assumptions are documented if legacy feeds are in scope.
- [ ] L2 deployments check the Sequencer Uptime Feed before trusting price data.
- [ ] L2 deployments include a post-sequencer-recovery grace period.

## Precision And Normalization

- [ ] Code reads `decimals()` or documents why a constant is safe.
- [ ] No unsafe hardcoded 8-decimal assumption.
- [ ] Price normalization handles token decimals and feed decimals explicitly.
- [ ] Multiplication/division order avoids precision loss and overflow.
- [ ] Unit tests cover non-8-decimal feeds.

## Failure Modes

- [ ] Fallback oracle behavior is documented and bounded.
- [ ] Fallbacks cannot silently accept stale, zero, or manipulated values.
- [ ] Circuit breakers cap allowed price deviation or pause dependent actions.
- [ ] Feed-specific stale thresholds reflect asset liquidity and market hours.
- [ ] Wrong/deprecated feed address risk is documented in deployment runbooks.

## Documentation

- [ ] Feed address, network, heartbeat, deviation threshold, and decimals are documented.
- [ ] Oracle trust assumptions are included in user/admin docs.
- [ ] Upgrade procedure for feed replacement is access-controlled and monitored.
