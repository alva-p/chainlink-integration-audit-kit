# Changelog

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
