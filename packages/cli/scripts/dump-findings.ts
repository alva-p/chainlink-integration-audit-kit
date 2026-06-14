import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "../src/config.js";
import type { EcosystemBenchmarkManifest } from "../src/benchmark.js";
import { scanPath } from "../src/scanner.js";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = path.resolve(packageRoot, "../..");
const manifestPath = path.join(packageRoot, "benchmarks/ecosystem-repos.json");
const cacheDir = path.join(repoRoot, "cache/ecosystem-benchmark");
const outPath = path.join(repoRoot, "cache/ecosystem-benchmark-58-findings.json");

function checkoutDirectory(githubUrl: string): string {
  const name = githubUrl.replace(/\.git$/, "").split("/").slice(-2).join("__");
  return path.join(cacheDir, name);
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as EcosystemBenchmarkManifest;
  const records: Array<{
    project: string;
    file: string;
    line: number;
    ruleId: string;
    severity: string;
    confidence: string;
    title: string;
    snippet: string;
  }> = [];

  for (const repository of manifest.repositories) {
    const checkoutPath = checkoutDirectory(repository.githubUrl);
    const targetPath = path.join(checkoutPath, repository.scanPath ?? ".");
    const result = await scanPath(targetPath, {
      config: {
        ...defaultConfig,
        exclude: [...defaultConfig.exclude, "node_modules/", "artifacts/", "cache/", "out/", "broadcast/"],
      },
    });

    for (const finding of result.findings) {
      const content = await fs.readFile(finding.file, "utf8").catch(() => "");
      const lines = content.split(/\r?\n/);
      const start = Math.max(0, finding.line - 6);
      const end = Math.min(lines.length, finding.line + 14);
      const snippet = lines
        .slice(start, end)
        .map((lineText, index) => `${start + index + 1}: ${lineText}`)
        .join("\n");

      records.push({
        project: repository.project,
        file: path.relative(checkoutPath, finding.file),
        line: finding.line,
        ruleId: finding.ruleId,
        severity: finding.severity,
        confidence: finding.confidence,
        title: finding.title,
        snippet,
      });
    }
    console.log(`${repository.project}: ${result.findings.length} findings`);
  }

  await fs.writeFile(outPath, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`wrote ${records.length} records to ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
