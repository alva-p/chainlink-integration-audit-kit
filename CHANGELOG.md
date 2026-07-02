# Changelog

## 0.6.0 - 2026-07-02

Registry-verified checks: rules that compare hardcoded values against Chainlink's
official registries instead of code patterns — ground truth, not heuristics.

### Registry snapshot

- New `scripts/update-registry.ts` (`npm run update-registry`) distills Chainlink's
  reference data directory (the same source the official docs use) and the
  `smartcontractkit/chain-selectors` repository into a pinned
  `src/registry/data.ts`: 1,583 feeds across 14 chains (address, name, decimals,
  heartbeat, feed category) and 269 official CCIP chain selectors (kept as
  strings — selector values exceed 2^53).

### New rules

- **CL-DF-008** (medium): hardcoded aggregator address not found in the official
  feed registry — mistyped, retired, or third-party.
- **CL-DF-009** (high): code scales prices with an 8-decimal assumption but the
  registry says the feed has different decimals (e.g. BTC/ETH is 18).
- **CL-DF-010** (high, high confidence): feed address is flagged `deprecating`
  or `hidden` in the official registry — it will stop updating.
- **CL-CCIP-011** (high): numeric literal used in a chain-selector context that
  matches no official CCIP chain selector — typo'd selectors silently break
  allowlists.

### Validation

Scanned against the 60-repo ecosystem benchmark: 11 total leads (0 from
CL-CCIP-011 and CL-DF-010 — no noise), including a genuinely retired DIGG/BTC
feed still referenced by Badger/Midas oracle code.

## 0.5.0 - 2026-07-02

Continuous-control release: everything needed to keep the scanner installed in CI
instead of running it once.

### Baseline

- New `chainlink-audit baseline <path>` command records current findings in
  `.chainlink-audit-baseline.json`; subsequent scans only report **new** leads.
  Fingerprints anchor on rule + file + flagged line *content*, so unrelated edits
  that shift line numbers don't invalidate the baseline.
- `scan --no-baseline` bypasses the baseline for a full report.

### Inline suppressions

- `// chainlink-audit-ignore` (all rules) and
  `// chainlink-audit-ignore: CL-XXX-NNN -- reason` (listed rules only), valid on
  the flagged line or the line above. Suppressed counts are reported in the text
  output and JSON (`suppressed.inline` / `suppressed.baseline`).

### CI integration

- `scan --fail-on <severity>` exits 1 when any reported finding is at or above the
  given severity.
- `scan --changed-since <ref>` limits reported findings to `.sol` files changed
  since a git ref (diff + untracked).
- New composite GitHub Action (`action.yml` at repo root) that installs the CLI,
  scans, and emits SARIF for `github/codeql-action/upload-sarif`.
- SARIF results now carry `partialFingerprints` so GitHub code scanning deduplicates
  alerts across pushes.

### Agent verification layer

- New `.claude/agents/chainlink-verify.md` Claude Code agent: reads a JSON scan
  report, resolves each lead's cross-file context (parent contracts, inherited
  modifiers, delegated helpers), runs Refutation → Reachability → Trigger → Impact
  gates, and emits a verified triage (`CONFIRMED` / `FALSE POSITIVE` /
  `NEEDS-CONTEXT`) with ready-to-paste suppression comments.

## 0.4.0 - 2026-06-25

**7 new rules** derived from real audit findings (solodit-vault), a new benchmark
round against 3 production CCIP repos, and a false-positive fix discovered during
live scanning of the Aave GHO CCIP bridge.

### New rules

- **CL-DF-005** (medium): Deprecated `latestAnswer()` usage — does not expose
  `updatedAt`, `roundId`, or `answeredInRound`; backed by 3 real audit findings
  (Juicebox HIGH, Connext MEDIUM, Tigris MEDIUM).
- **CL-DF-006** (low): Missing `answeredInRound >= roundId` round-completeness
  check on `latestRoundData()` calls.
- **CL-DF-007** (medium): Chainlink aggregator `minAnswer`/`maxAnswer` bounds
  cached in the constructor — become stale after a proxy aggregator upgrade.
  Backed by Isomorph MEDIUM finding.
- **CL-VRF-004** (high): VRF redraw mechanism that overwrites `currentChainlinkRequestId`
  while a fulfillment is pending — enables selective result discarding by
  underfunding the LINK subscription. Backed by Forgeries HIGH finding.
- **CL-DS-001** (high): Data Streams report decoded or used without a visible
  `verifier.verify()` call.
- **CL-DS-002** (medium): Data Streams report price fields used without checking
  `validFromTimestamp` / `expiresAt` against `block.timestamp`.
- **CL-DS-003** (low): `report.bid` or `report.ask` used in an execution context
  without `report.price` — Chainlink recommends the benchmark mid-price for most
  execution logic.

### False-positive fix

- **CL-CCIP-001/002**: `delegatedCcipContent` now also follows `this.X(message)`
  self-delegation calls (e.g. `try this.processMessage(message) {} catch { ... }`).
  Previously the Aave GHO CCIP bridge (`AaveGhoCcipBridge.sol`) produced two
  spurious HIGH leads because `processMessage` — which validates both
  `sourceChainSelector` and `message.sender` — was called as an external
  `this.` call rather than a library delegation.

### Scanner improvements

- `latestAnswer()` calls now trigger `data-feeds` product detection.
- Data Streams product detection broadened to cover custom verifier wrappers
  (`IChainlinkDataStreamVerifier`, `DataStreamProvider`, `DataStreamVerifier`)
  and custom Report structs with the `feedId + expiresAt + bid/ask` field triad.

### Benchmark additions

Three new CCIP-focused repositories added to `benchmarks/ecosystem-repos.json`:
- `aave-dao/aave-helpers` (`src/bridges/ccip`) — Aave GHO CCIP bridge, audited
- `threshold-network/tbtc-v2` (`cross-chain/bob`) — tBTC Token Pool (LockRelease + BurnFromMint)
- `lombard-finance/evm-smart-contracts` (`contracts/bridge`) — LBTC BridgeTokenPool ($1B+ in BTC assets)

## 0.3.3 - 2026-06-14

Rule accuracy improvements driven by a 58-repository Chainlink Ecosystem
benchmark (`benchmarks/ecosystem-repos.json`), which cut total leads from 329
to 276 (-16%) without losing any confirmed true positives:

- CL-DF-001/002: contracts that themselves implement `latestRoundData()`
  (price feed wrappers/adapters that pass through the underlying feed's
  round data) are now treated as feed implementations, not consumers, and
  are skipped — the freshness/positive-answer check is the responsibility of
  their callers.
- CL-DF-002: recognizes `answer/price/oracleAnswer >= 0` guards and
  `aggregator.minAnswer()` lower-bound comparisons as a positive-answer check.
- CL-AUTO-003 / CL-VRF-003: pure `interface` declarations (no contract or
  library implementation in the file) are no longer flagged for missing
  pause controls or request-state tracking, since interfaces contain no
  logic to check.
- CL-FN-002/003: `hasFunctions` detection no longer matches `sendRequest`/
  `fulfillRequest` as substrings of unrelated identifiers (e.g.
  `CCIPSendRequested`).
- Scanner no longer aborts on broken symlinks (e.g. unresolved git
  submodules) when collecting Solidity files.
- Added `npm run benchmark:ecosystem` to scan the pinned 58-repository
  Chainlink Ecosystem benchmark set and report per-rule lead counts.

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
