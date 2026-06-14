import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultConfig, loadConfig, severityRank } from "./config.js";
import { rules } from "./rules/index.js";
import type { AuditConfig, ChainlinkProduct, Finding, RepoSignals, ScanOptions, ScanResult } from "./types.js";

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "out",
  "cache",
  "broadcast",
  "artifacts",
  "dist",
  "build",
]);

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  let source = "";
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index++;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`(^|/)${source}($|/)`);
}

function matchesExclude(relativePath: string, pattern: string): boolean {
  const normalizedPath = normalizePath(relativePath).replace(/^\/+/, "");
  const normalizedPattern = normalizePath(pattern).replace(/^\/+/, "");
  if (normalizedPattern.length === 0) return false;

  if (normalizedPattern.includes("*")) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }

  const directoryPattern = normalizedPattern.endsWith("/")
    ? normalizedPattern.slice(0, -1)
    : normalizedPattern;

  return (
    normalizedPath === directoryPattern ||
    normalizedPath.startsWith(`${directoryPattern}/`) ||
    normalizedPath.includes(`/${directoryPattern}/`)
  );
}

function isExcluded(fileOrDirectory: string, scanRoot: string, config: AuditConfig): boolean {
  const relativePath = path.relative(scanRoot, fileOrDirectory);
  const normalized = normalizePath(relativePath || path.basename(fileOrDirectory));
  return config.exclude.some((pattern) => matchesExclude(normalized, pattern));
}

async function collectSolidityFiles(
  targetPath: string,
  scanRoot: string,
  config: AuditConfig,
): Promise<string[]> {
  if (isExcluded(targetPath, scanRoot, config)) return [];

  let stat;
  try {
    stat = await fs.stat(targetPath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT" || code === "ELOOP") return [];
    throw error;
  }
  if (stat.isFile()) {
    if (!targetPath.endsWith(".sol")) return [];
    return [targetPath];
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !(entry.isDirectory() && ignoredDirectories.has(entry.name)))
      .filter((entry) => !entry.name.startsWith(".") || entry.name === ".")
      .map((entry) => collectSolidityFiles(path.join(targetPath, entry.name), scanRoot, config)),
  );

  return nested.flat();
}

function detectProducts(files: Array<{ file: string; content: string }>): Set<ChainlinkProduct> {
  const products = new Set<ChainlinkProduct>();
  const allContent = files.map((file) => file.content).join("\n");

  if (/(AggregatorV3Interface|latestRoundData|IChainlinkAggregator)/.test(allContent)) products.add("data-feeds");
  if (/(CCIPReceiver|Any2EVMMessage|IRouterClient|_ccipReceive|ccipReceive|sourceChainSelector|TokenPool|LockOrBurnInV1|ReleaseOrMintInV1|_validateLockOrBurn|_validateReleaseOrMint)/.test(allContent)) products.add("ccip");
  if (/(VRFConsumerBase|VRFCoordinator|fulfillRandomWords|requestRandomWords)/.test(allContent)) products.add("vrf");
  if (/(AutomationCompatibleInterface|KeeperCompatibleInterface|checkUpkeep|performUpkeep)/.test(allContent)) products.add("automation");
  if (/(FunctionsClient|FunctionsRequest|DONHostedSecrets|sendRequest|fulfillRequest)/i.test(allContent)) products.add("functions-cre");
  if (/(DataStreams|StreamsLookup|ILogAutomation|VerifierProxy|reportContext|ReportV3|BasicReport|websocket)/i.test(allContent)) products.add("data-streams");

  return products;
}

function detectL2Target(files: Array<{ file: string; content: string }>): boolean {
  const combined = files.map((file) => `${file.file}\n${file.content}`).join("\n");
  return /(\barbitrum\b|\boptimism\b|\bbase\b|\bpolygon\b|\bzksync\b|\bscroll\b|\blinea\b|\bmantle\b|\bblast\b|sepolia.*\bbase\b|\bl2\b)/i.test(combined);
}

export async function scanPath(targetPath: string, options: ScanOptions = {}): Promise<ScanResult> {
  const absoluteTarget = path.resolve(targetPath);
  const config = options.config ?? await loadConfig(absoluteTarget);
  const scanRoot = (await fs.stat(absoluteTarget)).isFile() ? path.dirname(absoluteTarget) : absoluteTarget;
  const solidityFiles = await collectSolidityFiles(absoluteTarget, scanRoot, config);
  const files = await Promise.all(
    solidityFiles.map(async (file) => ({
      file: path.relative(process.cwd(), file) || file,
      content: await fs.readFile(file, "utf8"),
    })),
  );

  const repoSignals: RepoSignals = {
    products: detectProducts(files),
    targetsL2: detectL2Target(files),
    files,
  };

  const findings: Finding[] = [];
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (const rule of rules) {
      findings.push(...rule.scan({ file: file.file, content: file.content, lines, repoSignals }));
    }
  }

  const minSeverityRank = severityRank(config.minSeverity ?? defaultConfig.minSeverity);
  const filteredFindings = findings.filter((finding) => severityRank(finding.severity) >= minSeverityRank);

  filteredFindings.sort((a, b) => {
    const fileCompare = a.file.localeCompare(b.file);
    if (fileCompare !== 0) return fileCompare;
    return a.line - b.line || a.ruleId.localeCompare(b.ruleId);
  });

  return {
    targetPath,
    scannedFiles: files.length,
    products: [...repoSignals.products].sort(),
    findings: filteredFindings,
    config,
  };
}
