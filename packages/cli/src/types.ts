export type Severity = "info" | "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";
export type OutputFormat = "text" | "json" | "markdown" | "html" | "sarif";
export type ChainlinkProduct =
  | "data-feeds"
  | "ccip"
  | "vrf"
  | "automation"
  | "functions-cre"
  | "data-streams";

export interface Finding {
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  file: string;
  line: number;
  title: string;
  description: string;
  risk: string;
  recommendation: string;
  manualReviewRequired: boolean;
  fingerprint?: string;
}

export interface AuditConfig {
  exclude: string[];
  format: OutputFormat;
  minSeverity: Severity;
}

export interface RuleMetadata {
  ruleId: string;
  product: ChainlinkProduct;
  severity: Severity;
  title: string;
  description: string;
}

export interface RuleContext {
  file: string;
  content: string;
  lines: string[];
  repoSignals: RepoSignals;
}

export interface RepoSignals {
  products: Set<ChainlinkProduct>;
  targetsL2: boolean;
  files: Array<{
    file: string;
    content: string;
  }>;
}

export interface Rule {
  metadata: RuleMetadata;
  scan(context: RuleContext): Finding[];
}

export interface ScanResult {
  targetPath: string;
  scannedFiles: number;
  products: ChainlinkProduct[];
  findings: Finding[];
  config: AuditConfig;
  suppressed: {
    inline: number;
    baseline: number;
  };
}

export interface ScanOptions {
  config?: AuditConfig;
  applyBaseline?: boolean;
}
