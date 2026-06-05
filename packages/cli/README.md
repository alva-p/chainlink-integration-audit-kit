# chainlink-audit

Security CLI for detecting potential Chainlink integration risks in Solidity repositories.

```bash
npm install -g chainlink-audit
chainlink-audit version
chainlink-audit init
chainlink-audit scan .
chainlink-audit scan . --format markdown --out chainlink-report.md
chainlink-audit scan . --format html --out chainlink-report.html
chainlink-audit scan . --format sarif --out chainlink-report.sarif
```

Findings are heuristic leads for manual review, not confirmed vulnerabilities.

Published package: https://www.npmjs.com/package/chainlink-audit

See the repository README for full documentation:
https://github.com/alva-p/chainlink-integration-audit-kit
