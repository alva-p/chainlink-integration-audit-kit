# Benchmark triage — registry rules (v0.6.0)

Manual triage of every finding the four registry-verified rules (CL-DF-008/009/010,
CL-CCIP-011) produced against the 60-repo [ecosystem benchmark](../packages/cli/benchmarks/ecosystem-repos.json).
This is the ground-truth measurement behind the severity calibration in v0.6.1.

## Result

**11 findings, 0 reportable vulnerabilities.** Every finding was technically correct
(the address really is absent from Chainlink's current directory) but had no security
impact: legacy code referencing retired feeds, or deliberate third-party oracles that
share the `AggregatorV3Interface`.

| # | Rule | Repo / file | Address | Verdict |
|---|------|-------------|---------|---------|
| 1 | CL-DF-008 | Badger `digg-oracles/ChainlinkOracle.sol:17` | `0x418a…1685` DIGG/BTC | Retired feed, dead product — no impact |
| 2 | CL-DF-008 | Badger `StabilizeStrategyDiggV1.sol:95` | `0x418a…1685` DIGG/BTC | Same retired feed |
| 3 | CL-DF-008 | Badger `contracts-reference/StabilizeStrategyDiggV1.sol:1249` | `0x418a…1685` | Same, vendored copy |
| 4 | CL-DF-008 | Badger `contracts-reference/…_postChanges.sol:1249` | `0x418a…1685` | Same, vendored copy |
| 5 | CL-DF-008 | Midas `oracles/mainnet/BadgerPriceOracle.sol:36` | `0x418a…1685` DIGG/BTC | Retired feed (Badger fork) |
| 6 | CL-DF-008 | Midas `oracles/mainnet/BadgerPriceOracle.sol:25` | `0x5892…2379` BADGER/ETH | Retired feed |
| 7 | CL-DF-008 | Frax `Oracle/FRAXOracleWrapper.sol:57` | `0x14d0…5D3E` FRAX/ETH | Not in current directory — decommissioned/native |
| 8 | CL-DF-008 | Frax `Staking/FraxCrossChainFarmV4_ERC20.sol:136` | `0x89e6…7A72` ETH/USD | Fraxtal chain, outside snapshot — unverifiable |
| 9 | CL-DF-008 | Origin `oracle/OETHOracleRouter.sol:68` | `0xC58F…A5Df` frxETH/ETH | Not in current directory — legacy |
| 10 | CL-DF-008 | Origin `oracle/OETHPlumeOracleRouter.sol:18` | `0x4915…7e9b` | **eOracle** (eo.app) on Plume — not Chainlink |
| 11 | CL-DF-009 | Midas `oracles/mainnet/BadgerPriceOracle.sol:47` | BTC/ETH (18 dec) | False positive — the `1e8` scales BTC token decimals in a composite price, not the feed |

## What this changed

The AggregatorV3Interface is an ecosystem-wide standard, and legacy code routinely
references feeds Chainlink has since retired. So "address not in the registry" is a
*verify-this* signal, not a high-impact lead. In v0.6.1:

- **CL-DF-008**: medium → **low** severity, description rewritten to lead with the
  common benign causes.
- **CL-DF-009**: high → **medium** severity, medium → **low** confidence, description
  now asks the reviewer to confirm the 8-decimal factor applies to the flagged feed.
- **CL-DF-010** and **CL-CCIP-011**: unchanged — neither fired in the benchmark (zero
  noise), and both are genuinely actionable when they do.

## Reproduce

```bash
npm -w packages/cli run benchmark:ecosystem -- --out cache/ecosystem-benchmark-report.json
# then filter for CL-DF-008/009/010 and CL-CCIP-011
```
