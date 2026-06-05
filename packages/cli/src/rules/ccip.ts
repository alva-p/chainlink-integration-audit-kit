import type { Rule } from "../types.js";
import { countMatches, extractFunctionBody, firstLineMatching, makeFinding } from "./helpers.js";

function ccipBody(content: string): string {
  return extractFunctionBody(content, "_ccipReceive") || extractFunctionBody(content, "ccipReceive");
}

function hasCcipReceiver(content: string): boolean {
  return /(function\s+_ccipReceive\b|function\s+ccipReceive\b|is\s+CCIPReceiver)/.test(content);
}

export const ccipRules: Rule[] = [
  {
    metadata: {
      ruleId: "CL-CCIP-001",
      product: "ccip",
      severity: "high",
      title: "Potential CCIP receive without source chain validation",
      description: "_ccipReceive appears to lack sourceChainSelector validation.",
    },
    scan(context) {
      if (!hasCcipReceiver(context.content)) return [];
      const body = ccipBody(context.content) || context.content;
      const validates = /sourceChainSelector/.test(body) && /(require|revert|allowed|trusted|allowlist)/i.test(body);
      if (validates) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /(_ccipReceive|ccipReceive)/),
          title: this.metadata.title,
          description: "Potential issue: messages from unexpected source chains may be accepted.",
          risk: "Cross-chain spoofing or misrouted messages can trigger unauthorized state changes.",
          recommendation: "Validate message.sourceChainSelector against an explicit allowlist before decoding payloads or mutating state.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-002",
      product: "ccip",
      severity: "high",
      title: "Potential CCIP receive without source sender validation",
      description: "_ccipReceive appears to lack trusted sender validation.",
    },
    scan(context) {
      if (!hasCcipReceiver(context.content)) return [];
      const body = ccipBody(context.content) || context.content;
      const validates = /(message\.sender|sender)/.test(body) && /(require|revert|allowed|trusted|allowlist)/i.test(body);
      if (validates) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /(_ccipReceive|ccipReceive)/),
          title: this.metadata.title,
          description: "Potential issue: messages from untrusted source contracts may be accepted.",
          risk: "An attacker may spoof business instructions if sender validation is missing or incomplete.",
          recommendation: "Decode message.sender and validate it against the trusted sender for the specific source chain.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-003",
      product: "ccip",
      severity: "high",
      title: "Potential missing CCIP router validation",
      description: "Receiver entrypoint does not appear to validate msg.sender/router.",
    },
    scan(context) {
      if (!hasCcipReceiver(context.content)) return [];
      const validatesRouter = /msg\.sender\s*(!=|==)\s*(router|s_router|i_router|address\(router\))|InvalidRouter|onlyRouter/i.test(context.content);
      if (validatesRouter || /is\s+CCIPReceiver/.test(context.content)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /(ccipReceive|_ccipReceive)/),
          title: this.metadata.title,
          description: "Potential issue: direct calls to the receiver may bypass CCIP router trust assumptions.",
          risk: "If the entrypoint is public/external and router validation is absent, fabricated messages may be processed.",
          recommendation: "Ensure only the expected CCIP router can invoke message handling, either through CCIPReceiver or explicit msg.sender checks.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-004",
      product: "ccip",
      severity: "medium",
      title: "Potential unsafe CCIP payload decoding",
      description: "Receiver decodes message data without obvious defensive checks.",
    },
    scan(context) {
      if (!hasCcipReceiver(context.content)) return [];
      const body = ccipBody(context.content) || context.content;
      if (!/abi\.decode\s*\(\s*message\.data/.test(body)) return [];
      const defensiveChecks = /(message\.data\.length|try\s+this|catch|InvalidPayload|Payload|version|schema)/i.test(body);
      if (defensiveChecks) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /abi\.decode\s*\(\s*message\.data/),
          title: this.metadata.title,
          description: "Potential issue: malformed payloads may revert or be decoded under the wrong schema.",
          risk: "Unexpected decoding failures can block message processing or route invalid business instructions.",
          recommendation: "Validate payload schema/version/length or isolate decoding failures so they can be handled manually.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-005",
      product: "ccip",
      severity: "medium",
      title: "Potential tightly coupled CCIP receiver logic",
      description: "Receiver appears to execute business logic directly without an obvious graceful failure path.",
    },
    scan(context) {
      if (!hasCcipReceiver(context.content)) return [];
      const body = ccipBody(context.content);
      if (!body) return [];
      const businessSignals = countMatches(body, [/transfer/i, /mint/i, /burn/i, /swap/i, /deposit/i, /withdraw/i, /credit/i, /call\s*\{/]);
      const gracefulFailure = /(try|catch|failedMessages|manual|retry|recover|queue)/i.test(context.content);
      if (businessSignals < 1 || gracefulFailure) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /(_ccipReceive|ccipReceive)/),
          title: this.metadata.title,
          description: "Potential issue: receiver business logic appears coupled to CCIP execution without a visible retry/manual path.",
          risk: "A revert in message handling may require manual execution or leave cross-chain state inconsistent.",
          recommendation: "Separate validation/decoding from business logic and add a tested graceful failure or manual recovery path where needed.",
        }),
      ];
    },
  },
];
