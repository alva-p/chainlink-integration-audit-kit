# Contributing

Thanks for improving `chainlink-integration-audit-kit`.

## Development

```bash
npm install
forge test
npm run build
npm test
```

## Adding Scanner Rules

1. Add a rule in the relevant file under `packages/cli/src/rules/`.
2. Include a stable rule ID using the `CL-SERVICE-NNN` format.
3. Keep the first version conservative and easy to explain.
4. Add tests in `packages/cli/test/scanner.test.ts`.
5. Document the rule in the relevant checklist if needed.

Scanner findings are leads. Avoid wording that implies certainty unless the rule performs enough analysis to prove the issue.

## Adding Solidity Examples

Each example should include:

- A vulnerable contract.
- A fixed contract.
- A Foundry test showing both unsafe and safe behavior.
- Minimal dependencies.
- Comments only where they clarify the security property being demonstrated.

## Security Reports

Do not disclose live third-party vulnerabilities in issues or pull requests. Use the affected project's security contact first. See `docs/disclosure-policy.md`.

## Style

- Keep examples small and audit-focused.
- Prefer explicit checks over clever abstractions.
- Use clear rule recommendations.
- Avoid adding large dependencies unless they materially improve the kit.
