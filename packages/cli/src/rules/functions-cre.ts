import type { Rule } from "../types.js";
import { firstLineMatching, hasAny, makeFinding } from "./helpers.js";

function hasFunctions(content: string): boolean {
  return /(FunctionsClient|FunctionsRequest|sendRequest|fulfillRequest|DONHostedSecrets|sourceCode|secrets)/i.test(content);
}

export const functionsCreRules: Rule[] = [
  {
    metadata: {
      ruleId: "CL-FN-001",
      product: "functions-cre",
      severity: "info",
      title: "Chainlink Functions usage detected",
      description: "Functions integration detected; migration and CRE considerations should be documented.",
    },
    scan(context) {
      if (!hasFunctions(context.content)) return [];
      if (/\bCRE\b|migration|sunset/i.test(context.content)) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /(FunctionsClient|FunctionsRequest|sendRequest)/i),
          title: this.metadata.title,
          description: "Potential issue: legacy Functions assumptions may be undocumented.",
          risk: "Operational migration, DON behavior, billing, or maintenance assumptions may be missed during audit or deployment.",
          recommendation: "Add an explicit Functions/CRE migration note and document current Chainlink guidance for this integration.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-FN-002",
      product: "functions-cre",
      severity: "medium",
      title: "Potential unsafe secrets or external API assumptions",
      description: "Functions-style code appears to reference secrets or API calls without clear handling assumptions.",
    },
    scan(context) {
      if (!hasFunctions(context.content)) return [];
      const secretsOrApi = /(apiKey|secret|Authorization|fetch\s*\(|axios|http)/i.test(context.content);
      const documented = /(DONHostedSecrets|encryptedSecrets|rateLimit|quota|throttle|secretVersion)/i.test(context.content);
      if (!secretsOrApi || documented) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /(apiKey|secret|Authorization|fetch\s*\(|axios|http)/i),
          title: this.metadata.title,
          description: "Potential issue: secrets or external API limits may not be handled safely.",
          risk: "Leaked credentials, throttled APIs, or nondeterministic external responses can break request fulfillment.",
          recommendation: "Use supported encrypted/DON-hosted secrets and document API quotas, throttling, and failure behavior.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-FN-003",
      product: "functions-cre",
      severity: "low",
      title: "Potential missing Functions timeout/error handling assumptions",
      description: "Functions request/fulfillment flow lacks obvious timeout or error handling documentation.",
    },
    scan(context) {
      if (!hasFunctions(context.content)) return [];
      const handlesErrors = hasAny(context.content, [/err\b/i, /error/i, /timeout/i, /failed/i, /retry/i]);
      if (handlesErrors) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /(sendRequest|fulfillRequest|Functions)/i),
          title: this.metadata.title,
          description: "Potential issue: request failure, timeout, or malformed response handling is not obvious.",
          risk: "Protocol state may remain unresolved or accept incomplete offchain results.",
          recommendation: "Document and test timeout, error, malformed response, and retry assumptions.",
        }),
      ];
    },
  },
];
