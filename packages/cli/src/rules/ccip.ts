import type { RepoSignals, Rule } from "../types.js";
import { countMatches, extractFunctionBody, firstLineMatching, makeFinding } from "./helpers.js";

function ccipBody(content: string): string {
  return [extractFunctionBody(content, "ccipReceive"), extractFunctionBody(content, "_ccipReceive")].filter(Boolean).join("\n");
}

function ccipHeader(content: string): string {
  const match = /function\s+(_ccipReceive|ccipReceive)\b[^{;]*/.exec(content);
  return match?.[0] ?? "";
}

function hasCcipReceiver(content: string): boolean {
  return /(function\s+_ccipReceive\b|function\s+ccipReceive\b|is\s+CCIPReceiver)/.test(content);
}

function isCcipBaseReceiver(content: string): boolean {
  return (
    /interface\s+\w*I?Any2EVMMessageReceiver\b/.test(content) ||
    /interface\s+\w+\s*{[\s\S]*function\s+ccipReceive\b[^{]*;/.test(content) ||
    /abstract\s+contract\s+\w*CCIPReceiver\b/.test(content) ||
    /function\s+_ccipReceive\b[^{;]*internal[^{;]*virtual\s*;/.test(content)
  );
}

function inheritsCcipReceiver(content: string): boolean {
  return /\bis\s+[\s\S{]*\bCCIPReceiver(Upgradeable)?\b/.test(content);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delegatedCcipContent(body: string, repoSignals: RepoSignals): string {
  const match = /\b([A-Z][A-Za-z0-9_]*)\s*\.\s*([A-Za-z0-9_]*ccipReceive|processCcipReceive)\s*\(/i.exec(body);
  if (!match) return body;

  const [, libraryOrContractName, functionName] = match;
  const typePattern = new RegExp(`\\b(library|contract)\\s+${escapeRegExp(libraryOrContractName)}\\b`);
  const functionPattern = new RegExp(`\\bfunction\\s+${escapeRegExp(functionName)}\\b`);
  const delegate = repoSignals.files.find((file) => typePattern.test(file.content) && functionPattern.test(file.content));

  return delegate ? `${body}\n${delegate.content}` : body;
}

function validatesSourceChain(content: string, body: string): boolean {
  const header = ccipHeader(content);
  const directValidation =
    /(sourceChainSelector|ccipSelectorToChainId)/.test(body) &&
    /(require|revert|allowed|trusted|allowlist|supportedNetworks|UnsupportedNetwork)/i.test(body);
  const modifierValidation =
    /(validChain|allowlisted|allowlist|trusted|onlyAllowlisted)[^{;]*(sourceChainSelector|\.sourceChainSelector)/i.test(
      header,
    );

  return directValidation || modifierValidation;
}

function validatesSourceSender(content: string, body: string): boolean {
  const header = ccipHeader(content);
  const directValidation =
    /(message\.sender|data\.sender|sender)/.test(body) &&
    /(require|revert|allowed|trusted|allowlist|Unauthorized)/i.test(body);
  const modifierValidation =
    /(validSender|trustedSender|allowlistedSender|onlyAllowlisted|allowlisted|allowlist|trusted)[^{;]*(message\.sender|\.sender|sender)/i.test(
      header,
    );

  return directValidation || modifierValidation;
}

function hasBusinessMutation(body: string): boolean {
  return (
    countMatches(body, [
      /transfer/i,
      /mint/i,
      /burn/i,
      /swap/i,
      /deposit/i,
      /withdraw/i,
      /credit/i,
      /call\s*\{/,
      /\[[^\]]+\]\s*(\+\+|--|\+=|-=|=)/,
      /\b(push|pop)\s*\(/,
    ]) > 0
  );
}

function hasMessageIdTracking(content: string, body: string): boolean {
  if (!/(messageId|\.messageId)/.test(body)) return false;
  return /(processed|received|executed|consumed|handled|seen|replay|duplicate|messageDetail|failedMessages|messageIdTo)/i.test(
    content,
  );
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
      if (isCcipBaseReceiver(context.content)) return [];
      const body = ccipBody(context.content) || context.content;
      const validationContent = `${ccipHeader(context.content)}\n${delegatedCcipContent(body, context.repoSignals)}`;
      if (validatesSourceChain(context.content, validationContent)) return [];
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
      if (isCcipBaseReceiver(context.content)) return [];
      const body = ccipBody(context.content) || context.content;
      const validationContent = `${ccipHeader(context.content)}\n${delegatedCcipContent(body, context.repoSignals)}`;
      if (validatesSourceSender(context.content, validationContent)) return [];
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
      if (isCcipBaseReceiver(context.content)) return [];
      const body = ccipBody(context.content) || context.content;
      const validationContent = `${ccipHeader(context.content)}\n${delegatedCcipContent(body, context.repoSignals)}`;
      const validatesRouter =
        /msg\.sender\s*(!=|==)\s*(router|s_router|i_router|address\(router\))|InvalidRouter|onlyRouter|NotCcipRouter|_msgSender\(\)\s*!=\s*address\([^)]*ccipRouter/i.test(
          validationContent,
        );
      if (validatesRouter || inheritsCcipReceiver(context.content)) return [];
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
      if (isCcipBaseReceiver(context.content)) return [];
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
      if (isCcipBaseReceiver(context.content)) return [];
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
  {
    metadata: {
      ruleId: "CL-CCIP-006",
      product: "ccip",
      severity: "medium",
      title: "Potential CCIP token amount indexing without length check",
      description: "Receiver appears to index destTokenAmounts without an obvious length check.",
    },
    scan(context) {
      if (!hasCcipReceiver(context.content)) return [];
      if (isCcipBaseReceiver(context.content)) return [];
      const body = ccipBody(context.content) || context.content;
      const indexesTokenAmounts =
        /(?:message\.|any2EvmMessage\.)?destTokenAmounts\s*\[\s*\d+\s*\]/.test(body) ||
        /(?:tokenAmounts|destTokenAmounts)\s*\[\s*\d+\s*\]/.test(body);
      if (!indexesTokenAmounts) return [];

      const checksLength =
        /(?:destTokenAmounts|tokenAmounts)\.length/.test(body) ||
        /(InvalidTokenAmounts|InvalidTokenAmount|NoToken|ExpectedToken|UnexpectedToken)/i.test(body);
      if (checksLength) return [];

      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /(?:destTokenAmounts|tokenAmounts)\s*\[/),
          title: this.metadata.title,
          description: "Potential issue: malformed or unexpected CCIP token payloads may revert before business logic can handle them.",
          risk: "Assuming at least one token amount can cause message processing failure or inconsistent recovery behavior.",
          recommendation: "Validate destTokenAmounts.length and expected token addresses/amounts before indexing token amounts.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-007",
      product: "ccip",
      severity: "medium",
      title: "Potential CCIP receiver without messageId idempotency tracking",
      description: "Mutating receiver logic does not show obvious messageId replay or idempotency tracking.",
    },
    scan(context) {
      if (!hasCcipReceiver(context.content)) return [];
      if (isCcipBaseReceiver(context.content)) return [];
      const body = ccipBody(context.content);
      if (!body) return [];
      if (!hasBusinessMutation(body)) return [];
      if (hasMessageIdTracking(context.content, body)) return [];

      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /(_ccipReceive|ccipReceive)/),
          title: this.metadata.title,
          description: "Potential issue: repeated or retried CCIP messages may execute mutating business logic more than once.",
          risk: "Without idempotency tracking, replay-like operational scenarios or manual execution flows can duplicate state changes.",
          recommendation: "Track processed messageId values or design receiver logic to be explicitly idempotent before mutating state.",
        }),
      ];
    },
  },
];
