# chainlink-audit

Security CLI for detecting potential Chainlink integration risks in Solidity repositories.

```bash
npm install -g chainlink-audit
chainlink-audit init
chainlink-audit scan .
chainlink-audit scan . --format markdown --out chainlink-report.md
```

Findings are heuristic leads for manual review, not confirmed vulnerabilities.

See the repository README for full documentation:
https://github.com/alva-p/chainlink-integration-audit-kit
