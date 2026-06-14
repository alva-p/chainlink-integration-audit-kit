import type { Rule } from "../types.js";
import { countMatches, extractFunctionBody, firstLineMatching, isInterfaceOnlyFile, makeFinding } from "./helpers.js";

function hasVrf(content: string): boolean {
  return /(VRFConsumerBase|VRFCoordinator|function\s+fulfillRandomWords\b|requestRandomWords)/.test(content);
}

export const vrfRules: Rule[] = [
  {
    metadata: {
      ruleId: "CL-VRF-001",
      product: "vrf",
      severity: "high",
      title: "Potential VRF callback without requestId tracking",
      description: "fulfillRandomWords appears to lack requestId validation.",
    },
    scan(context) {
      if (!/function\s+fulfillRandomWords\b/.test(context.content)) return [];
      const body = extractFunctionBody(context.content, "fulfillRandomWords") || context.content;
      const validates =
        /requestId/.test(body) &&
        /(pendingRequests|requestStatus|requests)\s*\[?\s*requestId/.test(context.content) &&
        /(require|revert|UnknownRequest)/.test(body);
      if (validates) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /fulfillRandomWords/),
          title: this.metadata.title,
          description: "Potential issue: unknown or duplicate VRF fulfillments may mutate state.",
          risk: "Incorrect request correlation can break fairness, overwrite randomness, or settle the wrong user/action.",
          recommendation: "Track request IDs before requesting randomness and reject unknown or duplicate fulfillments.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-VRF-002",
      product: "vrf",
      severity: "medium",
      title: "Potential heavy or reverting VRF callback",
      description: "fulfillRandomWords appears to contain business logic that may revert or exceed callback gas.",
    },
    scan(context) {
      if (!/function\s+fulfillRandomWords\b/.test(context.content)) return [];
      const body = extractFunctionBody(context.content, "fulfillRandomWords");
      if (!body) return [];
      const riskySignals = countMatches(body, [/for\s*\(/, /while\s*\(/, /\.call\s*\(/, /\.transfer\s*\(/, /\.send\s*\(/, /require\s*\(/, /revert\s+/]);
      if (riskySignals === 0) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /fulfillRandomWords/),
          title: this.metadata.title,
          description: "Potential issue: VRF callback contains logic that may revert, call externally, or become gas-heavy.",
          risk: "Failed VRF callbacks can block randomness delivery and leave protocol actions unresolved.",
          recommendation: "Keep fulfillRandomWords minimal, avoid external calls/unbounded loops, and test callback gas limits.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-VRF-003",
      product: "vrf",
      severity: "medium",
      title: "Potential VRF request state not tracked",
      description: "Randomness requests appear without obvious pre-fulfillment state tracking.",
    },
    scan(context) {
      if (!/requestRandomWords\s*\(/.test(context.content)) return [];
      if (isInterfaceOnlyFile(context.content)) return [];
      const tracksBeforeFulfillment = /(pendingRequests|requestStatus|requests)\s*\[.*\]\s*=/.test(context.content);
      if (tracksBeforeFulfillment) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /requestRandomWords\s*\(/),
          title: this.metadata.title,
          description: "Potential issue: request lifecycle state is not visibly committed when randomness is requested.",
          risk: "State may be manipulated between request and fulfillment or callbacks may not map to the intended action.",
          recommendation: "Store request metadata before or immediately after requesting randomness and validate it in the callback.",
        }),
      ];
    },
  },
];
