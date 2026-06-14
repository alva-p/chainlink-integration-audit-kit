import type { ChainlinkProduct, ScanResult } from "./types.js";

export interface EcosystemBenchmarkRepository {
  project: string;
  ecosystemUrl: string;
  githubUrl: string;
  commit: string;
  scanPath?: string;
  ecosystemProducts: string[];
  notes?: string;
}

export interface EcosystemBenchmarkManifest {
  source: string;
  selectionDate: string;
  selectionCriteria: string[];
  previousManualAuditSample: string[];
  repositories: EcosystemBenchmarkRepository[];
}

export interface BenchmarkProjectResult {
  project: string;
  githubUrl: string;
  commit: string;
  scannedFiles: number;
  scannerProducts: ChainlinkProduct[];
  totalFindings: number;
  findingsByRule: Record<string, number>;
}

export interface BenchmarkSummary {
  repositoryCount: number;
  scannedFiles: number;
  totalFindings: number;
  scannerProducts: ChainlinkProduct[];
  findingsByRule: Record<string, number>;
  findingsByProduct: Record<string, number>;
}

function increment(map: Record<string, number>, key: string, value = 1): void {
  map[key] = (map[key] ?? 0) + value;
}

function sortCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      return rightValue - leftValue || leftKey.localeCompare(rightKey);
    }),
  );
}

function productFromRuleId(ruleId: string): string {
  const productCode = ruleId.split("-")[1]?.toUpperCase();
  return (
    {
      AUTO: "automation",
      CCIP: "ccip",
      DF: "data-feeds",
      FN: "functions-cre",
      VRF: "vrf",
    }[productCode ?? ""] ?? "unknown"
  );
}

export function summarizeScanResults(
  manifestRepositories: EcosystemBenchmarkRepository[],
  scanResults: ScanResult[],
): BenchmarkProjectResult[] {
  return scanResults.map((result, index) => {
    const repository = manifestRepositories[index];
    const findingsByRule: Record<string, number> = {};

    for (const finding of result.findings) {
      increment(findingsByRule, finding.ruleId);
    }

    return {
      project: repository.project,
      githubUrl: repository.githubUrl,
      commit: repository.commit,
      scannedFiles: result.scannedFiles,
      scannerProducts: result.products,
      totalFindings: result.findings.length,
      findingsByRule: sortCounts(findingsByRule),
    };
  });
}

export function summarizeBenchmarkResults(projectResults: BenchmarkProjectResult[]): BenchmarkSummary {
  const products = new Set<ChainlinkProduct>();
  const findingsByRule: Record<string, number> = {};
  const findingsByProduct: Record<string, number> = {};

  for (const result of projectResults) {
    for (const product of result.scannerProducts) {
      products.add(product);
    }

    for (const [ruleId, count] of Object.entries(result.findingsByRule)) {
      increment(findingsByRule, ruleId, count);
      increment(findingsByProduct, productFromRuleId(ruleId), count);
    }
  }

  return {
    repositoryCount: projectResults.length,
    scannedFiles: projectResults.reduce((total, result) => total + result.scannedFiles, 0),
    totalFindings: projectResults.reduce((total, result) => total + result.totalFindings, 0),
    scannerProducts: [...products].sort(),
    findingsByRule: sortCounts(findingsByRule),
    findingsByProduct: sortCounts(findingsByProduct),
  };
}
