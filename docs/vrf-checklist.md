# VRF Audit Checklist

Use this checklist for Chainlink VRF consumers.

## Version And Funding

- [ ] VRF version is current or a migration note explains why not.
- [ ] Subscription or direct funding assumptions are documented.
- [ ] Callback gas limit is tested under realistic state size.
- [ ] Request confirmations and key hash choices are documented.

## Request Tracking

- [ ] Requests are tracked before calling the coordinator.
- [ ] `fulfillRandomWords` validates `requestId` is known and pending.
- [ ] Duplicate fulfillments are rejected or idempotent.
- [ ] Unknown request IDs cannot mutate state.
- [ ] User-controlled state cannot be manipulated between request and fulfillment in a way that changes outcome fairness.

## Callback Safety

- [ ] Callback contains minimal logic.
- [ ] Callback cannot revert unexpectedly due to unbounded loops or external calls.
- [ ] Fulfillment state is committed before dependent actions.
- [ ] Events expose request and fulfillment lifecycle.
