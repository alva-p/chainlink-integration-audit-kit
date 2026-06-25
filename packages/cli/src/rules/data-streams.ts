import type { Rule } from "../types.js";
import { firstLineMatching, isInterfaceOnlyFile, makeFinding } from "./helpers.js";

function hasDataStreams(content: string): boolean {
  if (/(BasicReport|ReportV3|StreamsLookup|IVerifierProxy|VerifierProxy|unverifiedReport|signedReports)/i.test(content)) return true;
  // Custom verifier wrappers (e.g. GMX's IChainlinkDataStreamVerifier, protocol-specific DataStreamProvider)
  if (/IChainlinkDataStreamVerifier|DataStreamVerifier|DataStreamProvider/.test(content)) return true;
  // Custom Report structs with the distinctive Data Streams field triad: feedId + expiresAt + (bid or ask)
  if (/\bfeedId\b/.test(content) && /\bexpiresAt\b/.test(content) && /\b(bid|ask)\b/.test(content)) return true;
  return false;
}

export const dataStreamsRules: Rule[] = [
  {
    metadata: {
      ruleId: "CL-DS-001",
      product: "data-streams",
      severity: "high",
      title: "Potential Data Streams report used without on-chain verification",
      description: "BasicReport or ReportV3 appears to be decoded or used without a visible verifier.verify() call.",
    },
    scan(context) {
      if (!hasDataStreams(context.content)) return [];
      if (isInterfaceOnlyFile(context.content)) return [];
      if (!/(BasicReport|ReportV3)/.test(context.content)) return [];
      const callsVerify = /\.verify\s*\(/.test(context.content);
      if (callsVerify) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /BasicReport|ReportV3/),
          title: this.metadata.title,
          description: "Potential issue: report data decoded directly from unverifiedReport without passing it through IVerifierProxy.verify() first.",
          risk: "An unverified report can be forged or replayed — an attacker controlling the off-chain feed can submit a fabricated price that the contract accepts as valid.",
          recommendation: "Always pass the raw report bytes through verifier.verify() and use only the returned decoded report struct for pricing logic.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-DS-002",
      product: "data-streams",
      severity: "medium",
      title: "Potential Data Streams report used without timestamp validation",
      description: "Report price fields appear to be used without checking validFromTimestamp or expiresAt.",
    },
    scan(context) {
      if (!hasDataStreams(context.content)) return [];
      if (isInterfaceOnlyFile(context.content)) return [];
      if (!/(BasicReport|ReportV3)/.test(context.content)) return [];
      // Must use price fields
      if (!/(\.price\b|report\.price|\.bid\b|report\.bid|\.ask\b|report\.ask)/.test(context.content)) return [];
      const checksFreshness =
        /(validFromTimestamp|expiresAt)/.test(context.content) &&
        /(block\.timestamp|require|revert|[Ss]tale|[Ee]xpired|[Ff]resh)/.test(context.content);
      if (checksFreshness) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /\.price\b|report\.price|\.bid\b|\.ask\b/),
          title: this.metadata.title,
          description: "Potential issue: report price is used without validating that block.timestamp is within the report's validFromTimestamp and expiresAt window.",
          risk: "An outdated report or a report from a future window can be used as current price, enabling mispriced trades, liquidations, or collateral calculations.",
          recommendation: "Validate that validFromTimestamp <= block.timestamp <= expiresAt before using any price field from the report.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-DS-003",
      product: "data-streams",
      severity: "low",
      title: "Potential use of bid/ask price instead of benchmark price in execution context",
      description: "report.bid or report.ask appears to be used in a business mutation context; Chainlink recommends report.price for most execution use cases.",
    },
    scan(context) {
      if (!hasDataStreams(context.content)) return [];
      if (isInterfaceOnlyFile(context.content)) return [];
      if (!/(\.bid\b|report\.bid|\.ask\b|report\.ask)/.test(context.content)) return [];
      const hasMutation =
        /(transfer|mint|burn|swap|deposit|withdraw|settle|execute|fill|liquidat)/i.test(context.content);
      if (!hasMutation) return [];
      // Suppress if report.price is also used — likely intentional spread/slippage logic
      if (/report\.price\b|\.price\b/.test(context.content)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /\.bid\b|report\.bid|\.ask\b|report\.ask/),
          title: this.metadata.title,
          description: "Potential issue: bid/ask prices represent the buy/sell spread and may differ from the mid-market benchmark price.",
          risk: "Using bid or ask for execution can cause systematic mispricing relative to the benchmark, potentially enabling price manipulation or unfair liquidations.",
          recommendation: "Use report.price (benchmark mid-price) for most execution logic. Use bid/ask only for intentional spread-aware fills, and document the design explicitly.",
        }),
      ];
    },
  },
];
