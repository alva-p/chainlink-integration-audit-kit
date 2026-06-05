# Rule Catalog

All MVP findings are potential issues and require manual review.

The default config excludes common noisy directories: `test/`, `tests/`, `mock/`, `mocks/`, `script/`, and `lib/`.

Supported report formats are `text`, `json`, `markdown`, and `html`.

## Data Feeds

| Rule ID | Severity | Title |
| --- | --- | --- |
| CL-DF-001 | Medium | Potential `latestRoundData()` use without freshness/staleness validation |
| CL-DF-002 | High | Potential missing positive answer check |
| CL-DF-003 | Low | Possible hardcoded feed decimals |
| CL-DF-004 | Medium | Potential missing L2 sequencer uptime check when repo targets L2 |

## CCIP

| Rule ID | Severity | Title |
| --- | --- | --- |
| CL-CCIP-001 | High | Potential `_ccipReceive` use without source chain validation |
| CL-CCIP-002 | High | Potential `_ccipReceive` use without sender validation |
| CL-CCIP-003 | High | Receiver does not appear to validate router/msg.sender |
| CL-CCIP-004 | Medium | Potential unsafe payload decoding or missing defensive checks |
| CL-CCIP-005 | Medium | Potential tightly coupled receiver business logic without graceful failure path |

## VRF

| Rule ID | Severity | Title |
| --- | --- | --- |
| CL-VRF-001 | High | Potential `fulfillRandomWords` use without requestId tracking |
| CL-VRF-002 | Medium | Potential callback reverts or excessive business logic |
| CL-VRF-003 | Medium | Potential randomness request state not tracked before fulfillment |

## Automation

| Rule ID | Severity | Title |
| --- | --- | --- |
| CL-AUTO-001 | High | Potential `performUpkeep` use without condition revalidation |
| CL-AUTO-002 | Medium | Potential stale `performData` trust |
| CL-AUTO-003 | Low | Potential missing pause/emergency controls for upkeep logic |

## Functions / CRE

| Rule ID | Severity | Title |
| --- | --- | --- |
| CL-FN-001 | Info | Chainlink Functions usage detected; consider adding migration note to CRE |
| CL-FN-002 | Medium | Potential unsafe secrets or external API assumptions |
| CL-FN-003 | Low | Potential missing timeout/error handling assumptions |

## Data Streams

The MVP detects Data Streams-related code to identify product usage. Deeper Data Streams rules are planned for report freshness, schema/version validation, duplicate report handling, and onchain verification assumptions.
