# Security Policy

`chainlink-audit` reports potential Chainlink integration risks for manual review. Findings are heuristic leads, not confirmed vulnerabilities.

## Reporting Issues In This Tool

If you find a vulnerability or supply-chain issue in this repository, please do not open a public issue with exploit details.

Use GitHub private vulnerability reporting if it is available for this repository. If it is not available, contact the maintainer privately and include:

- affected version or commit
- impact and affected command
- reproduction steps
- suggested fix, if known

## Reporting Issues In Third-Party Protocols

If `chainlink-audit` helps you identify a potential issue in a live protocol, follow that protocol's security policy, bug bounty, or private disclosure process first.

Do not publish exploit details, proof-of-concept transactions, or actionable attack paths before maintainers have had reasonable time to respond.

## Supported Versions

Security fixes are applied to the latest published npm version and the `main` branch.

## Scope

In scope:

- CLI behavior that can mislead users into unsafe conclusions
- report generation bugs that corrupt finding metadata
- dependency or packaging issues in the published npm package
- unsafe handling of local files or output paths

Out of scope:

- false positives from heuristic rules
- missing detections for unsupported Chainlink patterns
- vulnerabilities in third-party protocols scanned with the tool
