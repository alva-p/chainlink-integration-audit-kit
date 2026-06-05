import type { ScanResult } from "../types.js";

export function renderMarkdown(result: ScanResult): string {
  const products = result.products.length > 0 ? result.products.join(", ") : "none detected";
  const lines = [
    "# Chainlink Integration Audit Report",
    "",
    "## Summary",
    "",
    `- Target: \`${result.targetPath}\``,
    `- Solidity files scanned: ${result.scannedFiles}`,
    `- Detected Chainlink products: ${products}`,
    `- Minimum severity: ${result.config.minSeverity}`,
    `- Excluded paths: ${result.config.exclude.length > 0 ? result.config.exclude.join(", ") : "none"}`,
    `- Findings: ${result.findings.length}`,
    "",
    "This report contains potential issues produced by heuristic MVP rules. Findings require manual review before disclosure or remediation.",
    "",
  ];

  if (result.findings.length === 0) {
    lines.push("## Findings", "", "No potential Chainlink integration issues found by MVP rules.");
    return lines.join("\n");
  }

  lines.push("## Findings", "");
  for (const finding of result.findings) {
    lines.push(
      `### ${finding.ruleId}: ${finding.title}`,
      "",
      `- Severity: ${finding.severity}`,
      `- Confidence: ${finding.confidence}`,
      `- Location: \`${finding.file}:${finding.line}\``,
      `- Manual review required: ${finding.manualReviewRequired ? "yes" : "no"}`,
      "",
      "#### Description",
      "",
      finding.description,
      "",
      "#### Risk",
      "",
      finding.risk,
      "",
      "#### Recommendation",
      "",
      finding.recommendation,
      "",
    );
  }

  return lines.join("\n");
}
