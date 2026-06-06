import type { Finding, ScanResult } from "../types.js";

function severityRank(finding: Finding): number {
  return {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
  }[finding.severity];
}

function checkbox(label: string): string {
  return `- [ ] ${label}`;
}

export function renderTriageMarkdown(result: ScanResult): string {
  const products = result.products.length > 0 ? result.products.join(", ") : "none detected";
  const findings = [...result.findings].sort((a, b) => {
    const severityCompare = severityRank(b) - severityRank(a);
    if (severityCompare !== 0) return severityCompare;
    const confidenceCompare = b.confidence.localeCompare(a.confidence);
    if (confidenceCompare !== 0) return confidenceCompare;
    return a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId);
  });

  const lines = [
    "# Chainlink Audit Triage",
    "",
    "## Summary",
    "",
    `- Target: \`${result.targetPath}\``,
    `- Solidity files scanned: ${result.scannedFiles}`,
    `- Detected Chainlink products: ${products}`,
    `- Unverified leads: ${findings.length}`,
    "- Confirmed vulnerabilities: 0",
    "",
    "This triage file is for manual audit review. A high potential-impact lead is not a confirmed vulnerability.",
    "",
    "## Review Status Legend",
    "",
    checkbox("True positive"),
    checkbox("False positive"),
    checkbox("Accepted risk"),
    checkbox("Needs more context"),
    checkbox("Not reportable"),
    "",
    "## Leads",
    "",
  ];

  if (findings.length === 0) {
    lines.push("No unverified risk leads were found by the current rule set.", "");
    return lines.join("\n");
  }

  for (const finding of findings) {
    lines.push(
      `### ${finding.ruleId}: ${finding.title}`,
      "",
      `- Potential impact: ${finding.severity}`,
      `- Detection confidence: ${finding.confidence}`,
      `- Location: \`${finding.file}:${finding.line}\``,
      "- Confirmed vulnerability: no",
      "",
      "#### Manual Status",
      "",
      checkbox("True positive"),
      checkbox("False positive"),
      checkbox("Accepted risk"),
      checkbox("Needs more context"),
      checkbox("Not reportable"),
      "",
      "#### Reviewer Notes",
      "",
      "- Evidence:",
      "- Exploitability:",
      "- Impact:",
      "- Recommendation:",
      "- Disclosure path:",
      "",
      "#### Scanner Context",
      "",
      `- Description: ${finding.description}`,
      `- Risk: ${finding.risk}`,
      `- Recommendation: ${finding.recommendation}`,
      "",
    );
  }

  return lines.join("\n");
}
