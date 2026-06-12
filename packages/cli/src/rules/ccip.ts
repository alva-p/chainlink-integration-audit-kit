import type { RepoSignals, Rule } from "../types.js";
import { countMatches, escapeRegExp, extractBlockBody, extractFunctionBody, firstLineMatching, makeFinding } from "./helpers.js";

function ccipBody(content: string): string {
  return [extractFunctionBody(content, "ccipReceive"), extractFunctionBody(content, "_ccipReceive")].filter(Boolean).join("\n");
}

const CCIP_RECEIVE_DECL = /function\s+(_ccipReceive|ccipReceive)\b/;

function ccipHeader(content: string): string {
  const match = /function\s+(_ccipReceive|ccipReceive)\b[^{;]*/.exec(content);
  return match?.[0] ?? "";
}

function hasCcipReceiver(content: string): boolean {
  return /(function\s+_ccipReceive\b|function\s+ccipReceive\b|is\s+CCIPReceiver)/.test(content);
}

function isCcipBaseReceiver(content: string): boolean {
  if (/interface\s+\w*I?Any2EVMMessageReceiver\b/.test(content)) return true;
  if (/interface\s+\w+\s*{[\s\S]*function\s+ccipReceive\b[^{]*;/.test(content)) return true;
  if (/abstract\s+contract\s+\w*CCIPReceiver\b/.test(content)) return true;
  if (/function\s+_ccipReceive\b[^{;]*internal[^{;]*virtual\s*;/.test(content)) return true;
  // Guard stub: ccipReceive body is only a revert — intentional "not a receiver" pattern (e.g. EVM2EVMOffRamp)
  const ccipReceiveBody = extractFunctionBody(content, "ccipReceive");
  if (ccipReceiveBody) {
    const bodyTrimmed = ccipReceiveBody.trim();
    if (
      /^\s*revert\s*\(\s*\)\s*;\s*$/.test(bodyTrimmed) ||
      /^\s*revert\s+\w[\w.]*\s*\([^)]*\)\s*;\s*$/.test(bodyTrimmed)
    )
      return true;
  }
  return false;
}

function inheritsCcipReceiver(content: string): boolean {
  return /\bis\s+[\s\S{]*\bCCIPReceiver(Upgradeable)?\b/.test(content);
}

function extractParentNames(content: string): string[] {
  const match = /\bcontract\s+\w+\s+is\s+([\w\s,]+?)(?:\{|$)/m.exec(content);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function inheritsViaCcipReceiver(content: string, repoSignals: RepoSignals): boolean {
  const parents = extractParentNames(content);
  return parents.some((parent) => {
    const parentPattern = new RegExp(`\\b(?:abstract\\s+)?contract\\s+${escapeRegExp(parent)}\\b`);
    const parentFile = repoSignals.files.find((f) => parentPattern.test(f.content));
    return parentFile ? inheritsCcipReceiver(parentFile.content) : false;
  });
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

function extractModifierNames(header: string): string[] {
  const afterParams = header.replace(/^function\s+\w+\s*\([^)]*\)/s, "");
  const names = afterParams.match(/\b[A-Za-z_]\w*\b/g) ?? [];
  const keywords = new Set([
    "external",
    "public",
    "internal",
    "private",
    "view",
    "pure",
    "payable",
    "override",
    "virtual",
    "returns",
  ]);
  return [...new Set(names)].filter((name) => !keywords.has(name));
}

function resolveModifierBodies(content: string, repoSignals: RepoSignals): string {
  const header = ccipHeader(content);
  const modifierNames = extractModifierNames(header);
  if (modifierNames.length === 0) return "";

  const parents = extractParentNames(content);
  const parentFiles = repoSignals.files.filter((file) =>
    parents.some((parent) => new RegExp(`\\b(?:abstract\\s+)?contract\\s+${escapeRegExp(parent)}\\b`).test(file.content)),
  );
  const candidateFiles = [{ content }, ...parentFiles];

  return modifierNames
    .map((name) => {
      const declaration = new RegExp(`modifier\\s+${escapeRegExp(name)}\\b`);
      for (const file of candidateFiles) {
        const body = extractBlockBody(file.content, declaration);
        if (body) return body;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function stripEmitLines(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/\bemit\b/.test(line))
    .join("\n");
}

function validatesSourceChain(content: string, body: string): boolean {
  const header = ccipHeader(content);
  // Strip event emissions before checking: sourceChainSelector that only appears in emit
  // calls (e.g. for logging) must not suppress the finding.
  const bodyWithoutEmits = stripEmitLines(body);
  const directValidation =
    /(sourceChainSelector|ccipSelectorToChainId)/.test(bodyWithoutEmits) &&
    /(require|revert|allowed|trusted|allowlist|supportedNetworks|UnsupportedNetwork)/i.test(body);
  const modifierValidation =
    /(validChain|allowlisted|allowlist|trusted|onlyAllowlisted)[^{;]*(sourceChainSelector|\.sourceChainSelector)/i.test(
      header,
    );

  return directValidation || modifierValidation;
}

function validatesSourceSender(content: string, body: string): boolean {
  const header = ccipHeader(content);
  // Strip event emissions before checking: sender that only appears in emit
  // calls must not suppress the finding.
  const bodyWithoutEmits = stripEmitLines(body);
  const directValidation =
    /(message\.sender|data\.sender|sender)/.test(bodyWithoutEmits) &&
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

function hasTokenPoolSender(content: string): boolean {
  return (
    /function\s+lockOrBurn\b/.test(content) &&
    /(Pool\.LockOrBurnInV1|LockOrBurnInV1|is\s+[\w\s,]*TokenPool)/.test(content)
  );
}

function hasTokenPoolReceiver(content: string): boolean {
  return (
    /function\s+releaseOrMint\b/.test(content) &&
    /(Pool\.ReleaseOrMintInV1|ReleaseOrMintInV1|is\s+[\w\s,]*TokenPool)/.test(content)
  );
}

function isTokenPoolBase(content: string): boolean {
  if (/abstract\s+contract\s+\w*TokenPool\b/.test(content)) return true;
  if (/interface\s+\w*(TokenPool|IPool)\b/.test(content)) return true;
  // Abstract contracts that inherit from a TokenPool base (e.g. BurnMintTokenPoolAbstract is BurnMintTokenPool)
  if (/abstract\s+contract\s+\w+\s+is\s+[\w\s,]*TokenPool\b/.test(content)) return true;
  return false;
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
      const validationContent = `${ccipHeader(context.content)}\n${delegatedCcipContent(body, context.repoSignals)}\n${resolveModifierBodies(context.content, context.repoSignals)}`;
      if (validatesSourceChain(context.content, validationContent)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, CCIP_RECEIVE_DECL),
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
      const validationContent = `${ccipHeader(context.content)}\n${delegatedCcipContent(body, context.repoSignals)}\n${resolveModifierBodies(context.content, context.repoSignals)}`;
      if (validatesSourceSender(context.content, validationContent)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, CCIP_RECEIVE_DECL),
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
      if (validatesRouter || inheritsCcipReceiver(context.content) || inheritsViaCcipReceiver(context.content, context.repoSignals)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, CCIP_RECEIVE_DECL),
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
      // A trusted, validated sender already constrains the payload to the expected schema.
      const validationContent = `${ccipHeader(context.content)}\n${delegatedCcipContent(body, context.repoSignals)}\n${resolveModifierBodies(context.content, context.repoSignals)}`;
      if (validatesSourceSender(context.content, validationContent)) return [];
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
          line: firstLineMatching(context.lines, CCIP_RECEIVE_DECL),
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
          line: firstLineMatching(context.lines, CCIP_RECEIVE_DECL),
          title: this.metadata.title,
          description: "Potential issue: repeated or retried CCIP messages may execute mutating business logic more than once.",
          risk: "Without idempotency tracking, replay-like operational scenarios or manual execution flows can duplicate state changes.",
          recommendation: "Track processed messageId values or design receiver logic to be explicitly idempotent before mutating state.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-008",
      product: "ccip",
      severity: "high",
      title: "Potential CCIP Token Pool lockOrBurn without _validateLockOrBurn",
      description: "lockOrBurn override does not appear to call _validateLockOrBurn.",
    },
    scan(context) {
      if (!hasTokenPoolSender(context.content)) return [];
      if (isTokenPoolBase(context.content)) return [];
      const body = extractFunctionBody(context.content, "lockOrBurn");
      if (!body) return [];
      if (/_validateLockOrBurn\s*\(/.test(body)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /function\s+lockOrBurn\b/),
          title: this.metadata.title,
          description: "Potential issue: lockOrBurn may skip rate limit and chain allowlist enforcement.",
          risk: "Omitting _validateLockOrBurn bypasses CCIP-enforced rate limits and supported-chain checks, enabling unrestricted token locking or burning.",
          recommendation: "Call _validateLockOrBurn(lockOrBurnIn) at the start of every lockOrBurn override before executing custom logic.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-009",
      product: "ccip",
      severity: "high",
      title: "Potential CCIP Token Pool releaseOrMint without _validateReleaseOrMint",
      description: "releaseOrMint override does not appear to call _validateReleaseOrMint.",
    },
    scan(context) {
      if (!hasTokenPoolReceiver(context.content)) return [];
      if (isTokenPoolBase(context.content)) return [];
      const body = extractFunctionBody(context.content, "releaseOrMint");
      if (!body) return [];
      if (/_validateReleaseOrMint\s*\(/.test(body)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /function\s+releaseOrMint\b/),
          title: this.metadata.title,
          description: "Potential issue: releaseOrMint may skip offRamp caller verification and rate limit enforcement.",
          risk: "Omitting _validateReleaseOrMint allows arbitrary callers to trigger token minting or release, bypassing CCIP trust boundaries.",
          recommendation: "Call _validateReleaseOrMint(releaseOrMintIn) at the start of every releaseOrMint override before minting or releasing tokens.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-CCIP-010",
      product: "ccip",
      severity: "medium",
      title: "Potential unsafe CCIP Token Pool sourcePoolData decoding",
      description: "releaseOrMint decodes sourcePoolData without obvious defensive checks.",
    },
    scan(context) {
      if (!hasTokenPoolReceiver(context.content)) return [];
      if (isTokenPoolBase(context.content)) return [];
      const body = extractFunctionBody(context.content, "releaseOrMint");
      if (!body) return [];
      if (!/abi\.decode\s*\(\s*(?:releaseOrMintIn\.)?sourcePoolData/.test(body)) return [];
      const defensiveChecks = /(sourcePoolData\.length|try\s+this|catch|InvalidSourcePoolData|InvalidPayload|schema|version)/i.test(body);
      if (defensiveChecks) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /abi\.decode\s*\(\s*(?:releaseOrMintIn\.)?sourcePoolData/),
          title: this.metadata.title,
          description: "Potential issue: malformed or unexpected sourcePoolData may cause releaseOrMint to revert and block token delivery.",
          risk: "If sourcePoolData schema changes across an upgrade or pool version, decoding failures can permanently brick in-flight transfers.",
          recommendation: "Validate sourcePoolData length or schema before decoding, or isolate decode failures so they can be handled without reverting the entire transfer.",
        }),
      ];
    },
  },
];
