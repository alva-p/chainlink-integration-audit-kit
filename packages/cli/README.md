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

Published package: https://www.npmjs.com/package/chainlink-audit

See the repository README for full documentation:
https://github.com/alva-p/chainlink-integration-audit-kit
