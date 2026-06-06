# Chainlink Audit Kit Handoff

Repo: https://github.com/alva-p/chainlink-integration-audit-kit

Latest pushed work before this handoff:

- `59460d1 Reduce CCIP false positives from real repos`

## Immediate Goal

Publish `chainlink-audit@0.3.0` from the Linux notebook where npm is already authenticated, then create/push the `v0.3.0` GitHub release tag.

## Publish Checklist

```bash
git clone https://github.com/alva-p/chainlink-integration-audit-kit.git
cd chainlink-integration-audit-kit
npm install
npm test
npm run build
forge test
npm audit
npm pack --workspace packages/cli --dry-run
npm publish --workspace packages/cli
git tag v0.3.0
git push origin v0.3.0
```

If the repo already exists on the notebook:

```bash
cd chainlink-integration-audit-kit
git status
git pull --rebase origin main
```

If there are local changes on the notebook, commit or stash them before pulling.

## Already Verified Locally

- `npm test`: 20 passed.
- `npm run build`: OK.
- `forge test`: 15 passed.
- `npm audit`: 0 vulnerabilities.
- `npm run scan:examples`: OK.
- `npm pack --workspace packages/cli --dry-run`: OK.

## What Changed For 0.3.0

- Honest report language: scanner output is described as unverified risk leads, not confirmed vulnerabilities.
- Added `chainlink-audit triage <report.json> --out triage.md`.
- Added SARIF output for GitHub Code Scanning workflows.
- Added CCIP rules for token amount indexing assumptions and messageId idempotency review.
- Reduced CCIP false positives for:
  - receiver interfaces
  - abstract/base receivers
  - source/sender validation in modifiers
  - delegated receiver validation in libraries
  - `CCIPReceiver` / `CCIPReceiverUpgradeable` inheritance
  - router validation in `ccipReceive` before delegating to `_ccipReceive`

## Real-World CCIP Benchmark Notes

Scanned candidates:

- `aave/gho-core`
- `Synthetixio/synthetix-v3`
- `gyrostable/ccip-gyd`
- `flashliquidity/flashliquidity-portals`
- `GhoBridge/smart-contracts`
- `smartcontractkit/ccip-icm`

Best next manual-review target:

- https://github.com/gyrostable/ccip-gyd

Remaining scanner leads there:

- `CL-CCIP-005`: graceful failure/manual recovery review.
- `CL-CCIP-007`: messageId/idempotency review.

Important: these are not confirmed vulnerabilities. Treat them as manual audit leads only.

## Release Notes Draft

```md
# chainlink-audit v0.3.0

This release moves Chainlink Audit Kit toward a more professional manual-review workflow.

- Reports now describe scanner output as unverified risk leads, not confirmed vulnerabilities.
- New `triage` command generates a manual review checklist from JSON scan output.
- SARIF output supports GitHub Code Scanning upload workflows.
- CCIP rules now include token amount indexing assumptions and messageId idempotency review.
- False positives are reduced for real-world CCIP code patterns, including interfaces, delegated validation, router checks inherited from `CCIPReceiver`, and `ccipReceive` wrappers.

Validation:

- `npm test`: 20 passed.
- `npm run build`: OK.
- `forge test`: 15 passed.
- `npm audit`: 0 vulnerabilities.
- `npm run scan:examples`: OK.
- `npm pack --workspace packages/cli --dry-run`: OK.
```
