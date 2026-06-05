# Chainlink Audit Kit

Security CLI for Chainlink-powered smart contracts.

Scan Solidity repositories for potential risky integration patterns across Chainlink Data Feeds, CCIP, VRF, Automation, and Functions/CRE.

```bash
npm install -g chainlink-audit
chainlink-audit scan .
chainlink-audit scan . --format markdown --out chainlink-report.md
```

The CLI detects likely Chainlink product usage and reports potential integration risks. Findings are heuristic leads for manual review, not confirmed vulnerabilities.

## What It Detects

- stale or incomplete Chainlink Data Feed validation
- missing CCIP source chain, sender, or router validation
- unsafe VRF request and fulfillment tracking
- Automation upkeep revalidation issues
- Chainlink Functions migration and external API assumptions
- Data Streams-related code signals

## Install From Source

```bash
git clone https://github.com/alva-p/chainlink-integration-audit-kit.git
cd chainlink-integration-audit-kit
npm install
npm run build
npm exec -- chainlink-audit version
```

During local development, run:

```bash
npm exec -- chainlink-audit scan examples
```

## Usage

```bash
chainlink-audit scan <path>
chainlink-audit scan <path> --format text
chainlink-audit scan <path> --format json
chainlink-audit scan <path> --format markdown --out chainlink-report.md
chainlink-audit rules
chainlink-audit version
```

Local repository examples:

```bash
npm exec -- chainlink-audit scan examples --format text
npm exec -- chainlink-audit scan examples --format json
npm exec -- chainlink-audit scan examples --format markdown --out chainlink-report.md
```

## Example Output

```text
Chainlink Integration Audit Kit
Target: examples
Solidity files scanned: 16
Detected Chainlink products: automation, ccip, data-feeds, vrf
Findings: 14

[HIGH] CL-CCIP-001 - Potential CCIP receive without source chain validation
  Confidence: medium
  Location: examples/ccip/vulnerable/VulnerableCCIPReceiver.sol:11
  Description: Potential issue: messages from unexpected source chains may be accepted.
  Risk: Cross-chain spoofing or misrouted messages can trigger unauthorized state changes.
  Recommendation: Validate message.sourceChainSelector against an explicit allowlist before decoding payloads or mutating state.
  Manual review required: yes
```

## How To Interpret Findings

Every finding is a potential issue. The scanner uses simple pattern matching and deliberately avoids claiming confirmed exploitation. Auditors should validate each lead by reading source, checking deployment assumptions, and adding tests where appropriate.

Fields include:

- `ruleId`: stable rule identifier.
- `severity`: expected impact if the issue is real.
- `confidence`: scanner confidence based on available patterns.
- `file` and `line`: source location for review.
- `title`, `description`, `risk`, `recommendation`: report-ready finding context.
- `manualReviewRequired`: always true for MVP findings.

False positives are expected, especially in abstract base contracts, mocks, tests, and code with custom validation helpers.

## Examples

The `examples/` directory contains minimal vulnerable and fixed Foundry examples for:

- Data Feed stale price handling.
- CCIP receiver source/sender/router validation.
- VRF request tracking.
- Automation `performUpkeep` revalidation.

Run:

```bash
forge test
npm run scan:examples
```

## Documentation

- `docs/rules.md`: MVP rule catalog.
- `docs/data-feeds-checklist.md`
- `docs/ccip-checklist.md`
- `docs/vrf-checklist.md`
- `docs/automation-checklist.md`
- `docs/disclosure-policy.md`
- `docs/audit-report-template.md`

## Disclosure Policy

If the CLI helps identify a potential issue in a live protocol, follow that protocol's security policy or bug bounty process. Do not publish exploit details before maintainers have had reasonable time to respond. See `docs/disclosure-policy.md`.

## Limitations

- No full Solidity AST or dataflow analysis in the MVP.
- No live feed address validation.
- No RPC calls or deployed contract checks.
- No proof of exploitability.
- Data Streams support is currently product detection only, with deeper rules planned.

## Roadmap

- AST-based rule engine.
- SARIF output for GitHub code scanning.
- `chainlink-audit ci` helper.
- `chainlink-audit init` config generator.
- Data Streams verification rules.
- Optional RPC-aware checks for feed addresses, heartbeats, and network assumptions.
- HTML report output.
