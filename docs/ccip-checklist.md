# CCIP Audit Checklist

Use this checklist for Chainlink CCIP senders, receivers, token transfers, and cross-chain business logic.

## Receiver Validation

- [ ] Receiver validates `msg.sender` is the expected CCIP router.
- [ ] Receiver validates `sourceChainSelector`.
- [ ] Receiver validates the source sender address.
- [ ] Validation happens before payload decoding or state changes.
- [ ] Tests cover invalid router, invalid source chain, and invalid sender.

## Message Handling

- [ ] Payload decoding checks expected schema and length.
- [ ] Replay or idempotency protection exists where duplicate execution would matter.
- [ ] Business logic is separated from `_ccipReceive` enough to test directly.
- [ ] Failed message handling and manual execution paths are tested.
- [ ] Receiver can fail gracefully without permanently blocking recovery.

## Operations

- [ ] Gas limits are estimated and tested under worst-case payloads.
- [ ] Token pool rate limits and liquidity monitoring assumptions are documented.
- [ ] Admin, rebalancer, and emergency roles are least privilege.
- [ ] Emergency pause or rate limiting exists for high-value flows.
- [ ] Cross-chain configuration changes are logged and delayed where appropriate.
