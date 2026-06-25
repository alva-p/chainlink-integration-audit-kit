import type { Rule } from "../types.js";
import { extractBlockBody, firstLineMatching, hasAny, isInterfaceOnlyFile, makeFinding } from "./helpers.js";

const AGGREGATOR_WRAPPER_PATTERN =
  /function\s+latestRoundData\s*\([^)]*\)\s*(?:external|public|view|override|virtual|\s)*returns\s*\(\s*uint80\s*,\s*int256\s*,\s*uint256\s*,\s*uint256\s*,\s*uint80\s*\)\s*\{/s;

function isAggregatorWrapper(content: string): boolean {
  return AGGREGATOR_WRAPPER_PATTERN.test(content);
}

export const dataFeedRules: Rule[] = [
  {
    metadata: {
      ruleId: "CL-DF-001",
      product: "data-feeds",
      severity: "medium",
      title: "Potential Data Feed read without freshness validation",
      description: "latestRoundData() appears to be used without an obvious stale price check.",
    },
    scan(context) {
      if (!/\.latestRoundData\s*\(/.test(context.content)) return [];
      if (isAggregatorWrapper(context.content)) return [];
      const hasFreshnessCheck =
        /updatedAt/.test(context.content) &&
        /(block\.timestamp|maxStaleness|stale|heartbeat|updatedAt\s*!=\s*0)/i.test(context.content);
      if (hasFreshnessCheck) return [];

      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /\.latestRoundData\s*\(/),
          title: this.metadata.title,
          description: "Potential issue: the feed answer may be accepted even when updatedAt is zero or older than the intended heartbeat.",
          risk: "Stale oracle data can lead to incorrect pricing, unsafe liquidations, incorrect collateral valuation, or stale settlement.",
          recommendation: "Validate updatedAt != 0 and enforce a feed-specific max staleness threshold before using the answer.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-DF-002",
      product: "data-feeds",
      severity: "high",
      title: "Potential missing positive answer check",
      description: "latestRoundData() appears to be used without requiring answer > 0.",
    },
    scan(context) {
      if (!/\.latestRoundData\s*\(/.test(context.content)) return [];
      if (isAggregatorWrapper(context.content)) return [];
      const hasPositiveAnswerCheck = hasAny(context.content, [
        /answer\s*>=?\s*0/,
        /price\s*>=?\s*0/,
        /oracleAnswer\s*>=?\s*0/,
        /InvalidOracleAnswer/,
        /answer\s*<=?\s*0/,
        /price\s*<=?\s*0/,
        /oracleAnswer\s*<=?\s*0/,
        /Invalid(?:Oracle)?(?:Price|Answer|Round)/i,
        /\.\s*minAnswer\s*\(\s*\)/,
      ]);
      if (hasPositiveAnswerCheck) return [];

      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /\.latestRoundData\s*\(/),
          title: this.metadata.title,
          description: "Potential issue: a zero or negative feed answer may be cast to uint256 or used as a valid price.",
          risk: "Non-positive oracle answers can break accounting, cause reverts, or create extreme normalized prices after casting.",
          recommendation: "Require answer > 0 before casting or using the price.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-DF-003",
      product: "data-feeds",
      severity: "low",
      title: "Possible hardcoded Data Feed decimals",
      description: "Code appears to assume 8 feed decimals or scale by a hardcoded 1e10 factor.",
    },
    scan(context) {
      if (!/(AggregatorV3Interface|latestRoundData|\.decimals\s*\()/i.test(context.content)) return [];
      const hardcodedDecimals = /(1e8|10\s*\*\*\s*8|100000000|\*\s*1e10|1e10)/;
      if (!hardcodedDecimals.test(context.content)) return [];

      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, hardcodedDecimals),
          title: this.metadata.title,
          description: "Potential issue: not all Chainlink feeds use the same decimals, and migrations can invalidate implicit assumptions.",
          risk: "Incorrect normalization can misprice assets by orders of magnitude.",
          recommendation: "Read feed.decimals() or document why the specific feed decimals are safe for this deployment.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-DF-004",
      product: "data-feeds",
      severity: "medium",
      title: "Potential missing L2 sequencer uptime check",
      description: "Repository appears to target L2 and use Data Feeds without an obvious Sequencer Uptime Feed check.",
    },
    scan(context) {
      if (!context.repoSignals.targetsL2) return [];
      if (!/\.latestRoundData\s*\(/.test(context.content)) return [];
      const hasSequencerCheck = /(SequencerUptime|sequencer|gracePeriod|L2Sequencer)/i.test(context.content);
      if (hasSequencerCheck) return [];

      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /\.latestRoundData\s*\(/),
          title: this.metadata.title,
          description: "Potential issue: L2 sequencer downtime can make recent-looking price data unsafe immediately after recovery.",
          risk: "Protocols may execute using stale or unfair prices around sequencer outages.",
          recommendation: "For L2 deployments, check the Chainlink Sequencer Uptime Feed and enforce a post-recovery grace period.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-DF-005",
      product: "data-feeds",
      severity: "medium",
      title: "Deprecated Chainlink latestAnswer() usage",
      description: "latestAnswer() is deprecated and does not expose updatedAt, roundId, or answeredInRound.",
    },
    scan(context) {
      if (!/\.latestAnswer\s*\(/.test(context.content)) return [];
      if (isAggregatorWrapper(context.content)) return [];
      if (isInterfaceOnlyFile(context.content)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "high",
          line: firstLineMatching(context.lines, /\.latestAnswer\s*\(/),
          title: this.metadata.title,
          description: "Potential issue: latestAnswer() provides no round metadata, making freshness, completeness, and validity checks impossible.",
          risk: "Stale or invalid oracle answers are accepted silently — no way to check updatedAt, answeredInRound, or roundId.",
          recommendation: "Replace latestAnswer() with latestRoundData() and validate updatedAt, answeredInRound >= roundId, and answer > 0.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-DF-006",
      product: "data-feeds",
      severity: "low",
      title: "Potential missing answeredInRound completeness check",
      description: "latestRoundData() appears to be used without validating answeredInRound >= roundId.",
    },
    scan(context) {
      if (!/\.latestRoundData\s*\(/.test(context.content)) return [];
      if (isAggregatorWrapper(context.content)) return [];
      const hasRoundCompletenessCheck =
        /(answeredInRound\s*>=?\s*roundId|answeredInRound\s*==\s*roundId|roundId\s*<=?\s*answeredInRound|roundId\s*==\s*answeredInRound)/i.test(
          context.content,
        );
      if (hasRoundCompletenessCheck) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /\.latestRoundData\s*\(/),
          title: this.metadata.title,
          description: "Potential issue: an incomplete round where answeredInRound < roundId indicates the aggregator has not finalized the answer.",
          risk: "Accepting answers from incomplete rounds can introduce a stale or unfinalized price into protocol state.",
          recommendation: "Require answeredInRound >= roundId after calling latestRoundData() to confirm the round is finalized.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-DF-007",
      product: "data-feeds",
      severity: "medium",
      title: "Potential cached Chainlink aggregator bounds",
      description: "minAnswer or maxAnswer appear to be read from the aggregator and stored, which may become stale after a proxy upgrade.",
    },
    scan(context) {
      if (!/(IAccessControlledOffchainAggregator|AccessControlledOffchainAggregator)/.test(context.content)) return [];
      if (!/(\.minAnswer\s*\(|\.maxAnswer\s*\()/.test(context.content)) return [];
      if (isAggregatorWrapper(context.content)) return [];
      if (isInterfaceOnlyFile(context.content)) return [];
      // Only flag when bounds are assigned inside a constructor — the vulnerability is specifically
      // about caching one-time at deployment, not about reading bounds dynamically in view functions.
      const constructorBody = extractBlockBody(context.content, /\bconstructor\s*\(/);
      if (!constructorBody) return [];
      const storesBounds = /(=\s*[\w.]+\.minAnswer\s*\(|=\s*[\w.]+\.maxAnswer\s*\()/.test(constructorBody);
      if (!storesBounds) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /\.minAnswer\s*\(|\.maxAnswer\s*\(/),
          title: this.metadata.title,
          description: "Potential issue: Chainlink proxy owners can upgrade the underlying aggregator; cached minAnswer/maxAnswer from the old aggregator become stale bounds.",
          risk: "After a Chainlink aggregator migration, price validation can revert or accept values outside the new aggregator's bounds, disrupting pricing and liquidations.",
          recommendation: "Read minAnswer/maxAnswer from the current aggregator during pricing, or add a guarded refresh path that updates cached bounds before they are used.",
        }),
      ];
    },
  },
];
