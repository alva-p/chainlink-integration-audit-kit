import type { ScanResult } from "../types.js";

export function renderText(result: ScanResult): string {
  const products = result.products.length > 0 ? result.products.join(", ") : "none detected";
  const header = [
    "Chainlink Integration Audit Kit",
    `Target: ${result.targetPath}`,
    `Solidity files scanned: ${result.scannedFiles}`,
    `Detected Chainlink products: ${products}`,
    `Minimum severity: ${result.config.minSeverity}`,
    `Excluded paths: ${result.config.exclude.length > 0 ? result.config.exclude.join(", ") : "none"}`,
    `Findings: ${result.findings.length}`,
  ].join("\n");

  if (result.findings.length === 0) {
    return `${header}\n\nNo potential Chainlink integration issues found by MVP rules. Manual review still required.`;
  }

  const findings = result.findings
    .map((finding) =>
      [
        `[${finding.severity.toUpperCase()}] ${finding.ruleId} - ${finding.title}`,
        `  Confidence: ${finding.confidence}`,
        `  Location: ${finding.file}:${finding.line}`,
        `  Description: ${finding.description}`,
        `  Risk: ${finding.risk}`,
        `  Recommendation: ${finding.recommendation}`,
        `  Manual review required: ${finding.manualReviewRequired ? "yes" : "no"}`,
      ].join("\n"),
    )
    .join("\n\n");

  return `${header}\n\n${findings}`;
}
