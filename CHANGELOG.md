# Changelog

## 0.3.2 - 2026-06-12

Rule accuracy improvements driven by a benchmark run against real-world CCIP
integrations from the Chainlink ecosystem:

- CL-CCIP-001/002: resolve source chain/sender validation performed in modifiers
  inherited from parent contracts in other files (e.g. Glacis-style adapters).
- CL-CCIP-004: no longer flags payload decoding when the sender is already
  validated, since a trusted sender constrains the payload schema.
- CL-CCIP-001/002/003/005/007: finding locations now anchor on the
  `_ccipReceive`/`ccipReceive` function declaration instead of the first
  matching comment or NatSpec line.
- CL-AUTO-001: follows internal/private helper calls from `performUpkeep`
  before flagging missing condition revalidation.
- CL-AUTO-003: pause/emergency-control detection is now repo-wide and
  recognizes more circuit-breaker patterns (`pauseUpkeeps`, `abort*`,
  `dismantle`, `circuitBreak`, `unpause`, etc.).
- CL-DF-002: recognizes `<= 0` / `< 0` revert guards and generic
  `Invalid*Price/Answer/Round` custom errors as a positive-answer check.

## 0.3.1 - 2026-06-06

- Fixed Token Pool base detection (`isTokenPoolBase`) to catch abstract
  contracts inheriting from `TokenPool` under non-standard names (e.g.
  `BurnMintTokenPoolAbstract is BurnMintTokenPool`), eliminating
  CL-CCIP-008/009 false positives on base contracts.
- `ccipReceive` bodies that are pure revert stubs (e.g. `EVM2EVMOffRamp` guard
  pattern) are now recognized as non-receivers for CL-CCIP-001/002/003.

## 0.3.0 - 2026-06-06

- Added honest risk-lead reporting language across text, Markdown, HTML, SARIF, and triage output.
- Added `chainlink-audit triage <report.json> --out triage.md` for manual review workflows.
- Added CCIP rules for token amount indexing assumptions and receiver idempotency review.
- Added SARIF output for GitHub Code Scanning uploads.
- Added project config support with default excludes and severity filtering.
- Reduced CCIP false positives for interfaces, base receivers, entrypoint modifiers, delegated receiver validation, and `CCIPReceiver`/`CCIPReceiverUpgradeable` inheritance.

## 0.1.0 - 2026-06-05

- Initial public npm release.
- Added CLI scanning for Chainlink Data Feeds, CCIP, VRF, Automation, Functions/CRE, and Data Streams patterns.
- Added text, Markdown, JSON, and HTML reports.
