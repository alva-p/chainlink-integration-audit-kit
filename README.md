# Chainlink Audit Kit

[![npm version](https://img.shields.io/npm/v/chainlink-audit.svg)](https://www.npmjs.com/package/chainlink-audit)
[![CI](https://github.com/alva-p/chainlink-integration-audit-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/alva-p/chainlink-integration-audit-kit/actions/workflows/ci.yml)

Security CLI for Chainlink-powered Solidity contracts. Scans repositories for risky integration patterns across Data Feeds, CCIP, VRF, Automation, and Functions/CRE and surfaces unverified risk leads for manual review.

## Install

```bash
npm install -g chainlink-audit
```

## Usage

```bash
chainlink-audit scan .                                        # text output
chainlink-audit scan . --format markdown --out report.md     # markdown
chainlink-audit scan . --format html --out report.html       # HTML report
chainlink-audit scan . --format sarif --out report.sarif     # SARIF (CI)
chainlink-audit scan . --min-severity medium                 # filter by severity
chainlink-audit triage report.json --out triage.md          # review checklist
chainlink-audit rules                                        # list all rules
chainlink-audit init                                         # create config file
```

## What It Detects

| Product | Rules | Examples |
|---|---|---|
| **CCIP** | 10 | Missing source chain / sender / router validation, unsafe payload decoding, Token Pool validator bypass |
| **Data Feeds** | 4 | Stale price, missing validity checks, hardcoded addresses |
| **VRF** | 3 | Untracked requests, missing fulfillment guard, weak randomness use |
| **Automation** | 3 | Missing `performUpkeep` revalidation, selector mismatch |
| **Functions/CRE** | 2 | Hardcoded secrets, inline source assumptions |

## Example Output

```
Chainlink Integration Audit Kit
Target: .
Solidity files scanned: 11
Detected Chainlink products: ccip, data-feeds, vrf
Unverified leads: 14

[HIGH POTENTIAL IMPACT] CL-CCIP-001 - Potential CCIP receive without source chain validation
  Detection confidence: medium
  Location: src/Receiver.sol:28
  Risk: Cross-chain spoofing or misrouted messages can trigger unauthorized state changes.
  Recommendation: Validate message.sourceChainSelector against an explicit allowlist.
  Manual review required: yes
```

![HTML report](docs/assets/html-report-dark.png)

## Configuration

```bash
chainlink-audit init
```

Creates `.chainlink-audit.json` in the project root:

```json
{
  "exclude": ["test/", "tests/", "mock/", "mocks/", "script/", "lib/"],
  "format": "text",
  "minSeverity": "low"
}
```

CLI flags override config values for that run.

## Interpreting Results

Every finding is an **unverified risk lead**, not a confirmed vulnerability. Severity reflects potential impact if the lead is real. False positives are expected in abstract base contracts, mocks, and code with custom validation patterns.

Use `chainlink-audit triage <report.json>` to generate a manual review checklist with status fields for each lead.

## Ecosystem Benchmark

The CLI package includes a pinned benchmark manifest for public repositories listed in the [Chainlink Ecosystem](https://www.chainlinkecosystem.com/ecosystem), excluding the original seven-repository manual audit sample.

```bash
npm -w packages/cli run benchmark:ecosystem -- --out ../../cache/ecosystem-benchmark-report.json
```

The runner clones pinned commits into `cache/ecosystem-benchmark`, scans each checkout, and writes aggregate per-project and per-rule lead counts.

## Install From Source

```bash
git clone https://github.com/alva-p/chainlink-integration-audit-kit.git
cd chainlink-integration-audit-kit
npm install && npm run build
node packages/cli/dist/index.js scan examples
```

## Limitations

- Pattern matching only — no AST or dataflow analysis.
- No RPC calls or live contract state checks.
- No proof of exploitability.

## Security

See [`SECURITY.md`](SECURITY.md) and [`docs/disclosure-policy.md`](docs/disclosure-policy.md).
