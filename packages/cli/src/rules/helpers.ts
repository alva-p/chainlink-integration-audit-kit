import type { Confidence, Finding, RuleContext, Severity } from "../types.js";

export function firstLineMatching(lines: string[], pattern: RegExp): number {
  const index = lines.findIndex((line) => pattern.test(line));
  return index === -1 ? 1 : index + 1;
}

export function hasAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content));
}

export function extractFunctionBody(content: string, functionName: string): string {
  const match = new RegExp(`function\\s+${functionName}\\b`).exec(content);
  if (!match) return "";

  const open = content.indexOf("{", match.index);
  if (open === -1) return "";

  let depth = 0;
  for (let index = open; index < content.length; index++) {
    const char = content[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) return content.slice(open + 1, index);
  }

  return content.slice(open + 1);
}

export function countMatches(content: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(content) ? 1 : 0), 0);
}

export function makeFinding(input: {
  context: RuleContext;
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  line: number;
  title: string;
  description: string;
  risk: string;
  recommendation: string;
  manualReviewRequired?: boolean;
}): Finding {
  return {
    ruleId: input.ruleId,
    severity: input.severity,
    confidence: input.confidence,
    file: input.context.file,
    line: input.line,
    title: input.title,
    description: input.description,
    risk: input.risk,
    recommendation: input.recommendation,
    manualReviewRequired: input.manualReviewRequired ?? true,
  };
}
