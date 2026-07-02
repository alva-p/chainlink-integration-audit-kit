import { lookupCcipSelector, lookupFeed, registryGeneratedAt, type FeedInfo } from "../registry/index.js";
import type { Rule } from "../types.js";
import { firstLineMatching, isInterfaceOnlyFile, makeFinding } from "./helpers.js";

// Rules in this file check hardcoded values against Chainlink's official registries
// (reference data directory + chain-selectors), pinned at build time.

const IGNORED_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

// Addresses used in an aggregator context: cast to the interface, or assigned to a
// feed/oracle/aggregator-named variable.
function extractFeedAddresses(content: string): Set<string> {
  const addresses = new Set<string>();
  for (const match of content.matchAll(/AggregatorV[23]Interface\s*\(\s*(0x[0-9a-fA-F]{40})\s*\)/g)) {
    addresses.add(match[1]);
  }
  for (const match of content.matchAll(/\b\w*(?:feed|oracle|aggregator)\w*\s*=\s*(?:address\s*\(\s*)?(0x[0-9a-fA-F]{40})/gi)) {
    addresses.add(match[1]);
  }
  return new Set([...addresses].filter((address) => !IGNORED_ADDRESSES.has(address.toLowerCase())));
}

function usesDataFeeds(content: string): boolean {
  return /(AggregatorV[23]Interface|latestRoundData|latestAnswer)/.test(content);
}

function describeFeed(feed: FeedInfo): string {
  return `${feed.name} on ${feed.chain} (${feed.decimals} decimals, heartbeat ${feed.heartbeat}s)`;
}

export const registryRules: Rule[] = [
  {
    metadata: {
      ruleId: "CL-DF-008",
      product: "data-feeds",
      severity: "medium",
      title: "Hardcoded feed address not found in the official Chainlink registry",
      description: "A hardcoded aggregator address does not match any feed in Chainlink's reference data directory.",
    },
    scan(context) {
      if (!usesDataFeeds(context.content)) return [];
      if (isInterfaceOnlyFile(context.content)) return [];
      const unknown = [...extractFeedAddresses(context.content)].filter((address) => !lookupFeed(address));
      return unknown.map((address) =>
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, new RegExp(address)),
          title: this.metadata.title,
          description: `Address ${address} is used as a price feed but is not listed in Chainlink's official registry (snapshot ${registryGeneratedAt}). It may be mistyped, deprecated, on an uncovered chain, or a custom/third-party oracle.`,
          risk: "A wrong or retired aggregator address returns no data or stale data, breaking every consumer of this price.",
          recommendation: "Verify the address against https://docs.chain.link/data-feeds/price-feeds/addresses for the target chain, and prefer constructor/config injection over hardcoding.",
        }),
      );
    },
  },
  {
    metadata: {
      ruleId: "CL-DF-009",
      product: "data-feeds",
      severity: "high",
      title: "Feed decimals assumption contradicts the official registry",
      description: "Code scales as if the feed had 8 decimals, but the registry says otherwise.",
    },
    scan(context) {
      if (!usesDataFeeds(context.content)) return [];
      const assumesEightDecimals = /(1e10|10\s*\*\*\s*10|1e8|10\s*\*\*\s*8|100000000\b)/.test(context.content);
      if (!assumesEightDecimals) return [];
      const findings = [];
      for (const address of extractFeedAddresses(context.content)) {
        const feed = lookupFeed(address);
        if (!feed || feed.decimals === 8) continue;
        findings.push(
          makeFinding({
            context,
            ruleId: this.metadata.ruleId,
            severity: this.metadata.severity,
            confidence: "medium",
            line: firstLineMatching(context.lines, new RegExp(address)),
            title: this.metadata.title,
            description: `This file scales prices with an 8-decimal factor, but ${address} is ${describeFeed(feed)} per the official registry (snapshot ${registryGeneratedAt}).`,
            risk: "Normalizing with the wrong decimals misprices the asset by orders of magnitude.",
            recommendation: `Read feed.decimals() at runtime or scale for ${feed.decimals} decimals explicitly.`,
          }),
        );
      }
      return findings;
    },
  },
  {
    metadata: {
      ruleId: "CL-DF-010",
      product: "data-feeds",
      severity: "high",
      title: "Feed address is marked as deprecating in the official Chainlink registry",
      description: "A hardcoded aggregator address points to a feed Chainlink has scheduled for deprecation.",
    },
    scan(context) {
      if (!usesDataFeeds(context.content)) return [];
      const findings = [];
      for (const address of extractFeedAddresses(context.content)) {
        const feed = lookupFeed(address);
        if (!feed || (feed.category !== "deprecating" && feed.category !== "hidden")) continue;
        findings.push(
          makeFinding({
            context,
            ruleId: this.metadata.ruleId,
            severity: this.metadata.severity,
            confidence: "high",
            line: firstLineMatching(context.lines, new RegExp(address)),
            title: this.metadata.title,
            description: `${address} is ${describeFeed(feed)} and is flagged "${feed.category}" in Chainlink's registry (snapshot ${registryGeneratedAt}). Deprecated feeds stop updating.`,
            risk: "Once the feed is shut down, latestRoundData() returns permanently stale data; consumers keep pricing against the last answer.",
            recommendation: "Migrate to the replacement feed listed in the Chainlink docs before the shutdown date, and add staleness checks that fail closed.",
          }),
        );
      }
      return findings;
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-011",
      product: "ccip",
      severity: "high",
      title: "Hardcoded CCIP chain selector not found in the official selector list",
      description: "A numeric literal used as a chain selector does not match any official CCIP chain selector.",
    },
    scan(context) {
      if (!/(sourceChainSelector|destinationChainSelector|chainSelector|ChainSelector)/.test(context.content)) return [];
      if (isInterfaceOnlyFile(context.content)) return [];
      const findings = [];
      const seen = new Set<string>();
      for (const [index, line] of context.lines.entries()) {
        if (!/selector/i.test(line)) continue;
        for (const match of line.matchAll(/\b(\d{12,20})\b/g)) {
          const literal = match[1];
          if (seen.has(literal) || lookupCcipSelector(literal)) continue;
          seen.add(literal);
          findings.push(
            makeFinding({
              context,
              ruleId: this.metadata.ruleId,
              severity: this.metadata.severity,
              confidence: "medium",
              line: index + 1,
              title: this.metadata.title,
              description: `Literal ${literal} is used in a chain-selector context but does not match any official CCIP chain selector (snapshot ${registryGeneratedAt}). It may be mistyped or copied from a stale source.`,
              risk: "A wrong selector silently breaks the allowlist: legitimate messages are rejected or, worse, the wrong chain is trusted.",
              recommendation: "Copy the selector from https://docs.chain.link/ccip/directory or the smartcontractkit/chain-selectors repository, and cover it with a fork test.",
            }),
          );
        }
      }
      return findings;
    },
  },
];
