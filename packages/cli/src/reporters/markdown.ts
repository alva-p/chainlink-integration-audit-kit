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
    `- Minimum potential impact: ${result.config.minSeverity}`,
    `- Excluded paths: ${result.config.exclude.length > 0 ? result.config.exclude.join(", ") : "none"}`,
    `- Unverified leads: ${result.findings.length}`,
    `- Confirmed vulnerabilities: 0`,
    "",
    "This report contains unverified risk leads produced by heuristic MVP rules. Potential impact is not confirmed exploitability. Validate each lead manually before disclosure or remediation.",
    "",
  ];

  if (result.findings.length === 0) {
    lines.push("## Risk Leads", "", "No Chainlink integration risk leads found by MVP rules.");
    return lines.join("\n");
  }

  lines.push("## Risk Leads", "");
  for (const finding of result.findings) {
    lines.push(
      `### ${finding.ruleId}: ${finding.title}`,
      "",
      `- Potential impact: ${finding.severity}`,
      `- Detection confidence: ${finding.confidence}`,
      `- Location: \`${finding.file}:${finding.line}\``,
      `- Manual review required: ${finding.manualReviewRequired ? "yes" : "no"}`,
      `- Confirmed vulnerability: no`,
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
