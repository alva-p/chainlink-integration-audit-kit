# chainlink-audit

Security review CLI for flagging unverified Chainlink integration risk leads in Solidity repositories.

```bash
npm install -g chainlink-audit
chainlink-audit version
chainlink-audit init
chainlink-audit scan .
chainlink-audit scan . --format markdown --out chainlink-report.md
chainlink-audit scan . --format html --out chainlink-report.html
chainlink-audit scan . --format sarif --out chainlink-report.sarif
chainlink-audit triage chainlink-report.json --out triage.md
```

Results are heuristic risk leads for manual review, not confirmed vulnerabilities. Potential impact reflects what could happen if the lead is real; it does not prove exploitability.

Use `chainlink-audit triage <report.json>` to turn JSON scan output into a manual review checklist.

## Ecosystem Benchmark

The repository includes a pinned Chainlink Ecosystem benchmark manifest at `benchmarks/ecosystem-repos.json`.
It tracks public GitHub repositories for Ecosystem projects outside the original manual audit sample.

```bash
npm run benchmark:ecosystem -- --out ../../cache/ecosystem-benchmark-report.json
```

The runner clones pinned commits into `../../cache/ecosystem-benchmark`, scans each checkout, and writes an aggregate JSON report with per-project and per-rule lead counts.

Published package: https://www.npmjs.com/package/chainlink-audit

See the repository README for full documentation:
https://github.com/alva-p/chainlink-integration-audit-kit
