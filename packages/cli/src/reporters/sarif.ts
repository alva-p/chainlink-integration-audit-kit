import { rules } from "../rules/index.js";
import type { Finding, ScanResult, Severity } from "../types.js";

function normalizeUri(value: string): string {
  return value.split("\\").join("/");
}

function sarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "high") return "error";
  if (severity === "info") return "note";
  return "warning";
}

function resultMessage(finding: Finding): string {
  return [
    finding.description,
    "",
    `Risk: ${finding.risk}`,
    "",
    `Recommendation: ${finding.recommendation}`,
    "",
    `Confidence: ${finding.confidence}. Manual review required: ${finding.manualReviewRequired ? "yes" : "no"}.`,
  ].join("\n");
}

export function renderSarif(result: ScanResult): string {
  const ruleMetadata = new Map(rules.map((rule) => [rule.metadata.ruleId, rule.metadata]));

  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "chainlink-audit",
            informationUri: "https://github.com/alva-p/chainlink-integration-audit-kit",
            rules: rules.map((rule) => ({
              id: rule.metadata.ruleId,
              name: rule.metadata.title,
              shortDescription: {
                text: rule.metadata.title,
              },
              fullDescription: {
                text: rule.metadata.description,
              },
              help: {
                text: `${rule.metadata.description}\n\nProduct: ${rule.metadata.product}. Severity: ${rule.metadata.severity}. Findings require manual review.`,
                markdown: `${rule.metadata.description}\n\n**Product:** ${rule.metadata.product}\n\n**Severity:** ${rule.metadata.severity}\n\nFindings require manual review.`,
              },
              properties: {
                product: rule.metadata.product,
                severity: rule.metadata.severity,
              },
            })),
          },
        },
        automationDetails: {
          id: "chainlink-audit/",
        },
        invocations: [
          {
            executionSuccessful: true,
            properties: {
              targetPath: result.targetPath,
              scannedFiles: result.scannedFiles,
              detectedProducts: result.products,
              minimumSeverity: result.config.minSeverity,
              excludedPaths: result.config.exclude,
            },
          },
        ],
        results: result.findings.map((finding) => {
          const metadata = ruleMetadata.get(finding.ruleId);
          return {
            ruleId: finding.ruleId,
            ruleIndex: rules.findIndex((rule) => rule.metadata.ruleId === finding.ruleId),
            level: sarifLevel(finding.severity),
            message: {
              text: resultMessage(finding),
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: normalizeUri(finding.file),
                  },
                  region: {
                    startLine: finding.line,
                  },
                },
              },
            ],
            properties: {
              severity: finding.severity,
              confidence: finding.confidence,
              product: metadata?.product,
              manualReviewRequired: finding.manualReviewRequired,
            },
          };
        }),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
