import { promises as fs } from "node:fs";
import path from "node:path";
import { rules } from "./rules/index.js";
import type { ChainlinkProduct, Finding, RepoSignals, ScanResult } from "./types.js";

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

async function collectSolidityFiles(targetPath: string): Promise<string[]> {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) {
    if (!targetPath.endsWith(".sol")) return [];
    return [targetPath];
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !(entry.isDirectory() && ignoredDirectories.has(entry.name)))
      .filter((entry) => !entry.name.startsWith(".") || entry.name === ".")
      .map((entry) => collectSolidityFiles(path.join(targetPath, entry.name))),
  );

  return nested.flat();
}

function detectProducts(files: Array<{ file: string; content: string }>): Set<ChainlinkProduct> {
  const products = new Set<ChainlinkProduct>();
  const allContent = files.map((file) => file.content).join("\n");

  if (/(AggregatorV3Interface|latestRoundData|IChainlinkAggregator)/.test(allContent)) products.add("data-feeds");
  if (/(CCIPReceiver|Any2EVMMessage|IRouterClient|_ccipReceive|ccipReceive|sourceChainSelector)/.test(allContent)) products.add("ccip");
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

export async function scanPath(targetPath: string): Promise<ScanResult> {
  const absoluteTarget = path.resolve(targetPath);
  const solidityFiles = await collectSolidityFiles(absoluteTarget);
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

  findings.sort((a, b) => {
    const fileCompare = a.file.localeCompare(b.file);
    if (fileCompare !== 0) return fileCompare;
    return a.line - b.line || a.ruleId.localeCompare(b.ruleId);
  });

  return {
    targetPath,
    scannedFiles: files.length,
    products: [...repoSignals.products].sort(),
    findings,
  };
}
