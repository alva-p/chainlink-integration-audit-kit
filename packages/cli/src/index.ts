#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { baselineFileName, writeBaseline } from "./baseline.js";
import {
  configFileName,
  loadConfig,
  parseOutputFormat,
  parseSeverity,
  severityRank,
  writeDefaultConfig,
} from "./config.js";
import { renderJson } from "./reporters/json.js";
import { renderHtml } from "./reporters/html.js";
import { renderMarkdown } from "./reporters/markdown.js";
import { renderSarif } from "./reporters/sarif.js";
import { renderText } from "./reporters/text.js";
import { renderTriageMarkdown } from "./reporters/triage.js";
import { rules } from "./rules/index.js";
import { scanPath } from "./scanner.js";
import type { OutputFormat, ScanResult } from "./types.js";

const version = "0.5.0";

function changedSolidityFiles(ref: string): Set<string> {
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const diff = execFileSync("git", ["diff", "--name-only", ref], { encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" });
  return new Set(
    [...diff.split("\n"), ...untracked.split("\n")]
      .filter((file) => file.endsWith(".sol"))
      .map((file) => path.relative(process.cwd(), path.resolve(gitRoot, file)).split(path.sep).join("/")),
  );
}

function render(format: OutputFormat, result: Awaited<ReturnType<typeof scanPath>>): string {
  if (format === "json") return renderJson(result);
  if (format === "markdown") return renderMarkdown(result);
  if (format === "html") return renderHtml(result);
  if (format === "sarif") return renderSarif(result);
  return renderText(result);
}

const program = new Command();

program
  .name("chainlink-audit")
  .description("CLI-first audit assistant for unverified Chainlink integration risk leads.")
  .version(version);

program
  .command("scan")
  .argument("<path>", "Solidity file or repository path to scan")
  .option("--format <format>", "Output format: text, json, markdown, html, sarif")
  .option("--min-severity <severity>", "Minimum severity: info, low, medium, high")
  .option("--out <file>", "Write report to a file instead of stdout")
  .option("--fail-on <severity>", "Exit with code 1 if any finding is at or above this severity (for CI)")
  .option("--changed-since <ref>", "Only report findings in .sol files changed since the given git ref")
  .option("--no-baseline", `Ignore ${baselineFileName} and report all findings`)
  .action(async (
    targetPath: string,
    options: {
      format?: string;
      minSeverity?: string;
      out?: string;
      failOn?: string;
      changedSince?: string;
      baseline: boolean;
    },
  ) => {
    try {
      const config = await loadConfig(targetPath);
      if (options.format) config.format = parseOutputFormat(options.format);
      if (options.minSeverity) config.minSeverity = parseSeverity(options.minSeverity);
      const failOn = options.failOn ? parseSeverity(options.failOn) : undefined;

      const format: OutputFormat = config.format;
      const result = await scanPath(targetPath, { config, applyBaseline: options.baseline });

      if (options.changedSince) {
        const changed = changedSolidityFiles(options.changedSince);
        result.findings = result.findings.filter((finding) =>
          changed.has(finding.file.split(path.sep).join("/")),
        );
      }

      const output = render(format, result);

      if (options.out) {
        await fs.writeFile(options.out, `${output}\n`, "utf8");
      } else {
        console.log(output);
      }

      const shouldFail =
        failOn !== undefined &&
        result.findings.some((finding) => severityRank(finding.severity) >= severityRank(failOn));
      process.exitCode = shouldFail ? 1 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`chainlink-audit: ${message}`);
      process.exitCode = 2;
    }
  });

program
  .command("baseline")
  .argument("<path>", "Solidity file or repository path to baseline")
  .description(`Record current findings in ${baselineFileName} so future scans only report new ones`)
  .action(async (targetPath: string) => {
    try {
      const config = await loadConfig(targetPath);
      const result = await scanPath(targetPath, { config, applyBaseline: false });
      const absoluteTarget = path.resolve(targetPath);
      const scanRoot = (await fs.stat(absoluteTarget)).isFile() ? path.dirname(absoluteTarget) : absoluteTarget;
      const target = await writeBaseline(scanRoot, result.findings);
      console.log(`Recorded ${result.findings.length} finding(s) in ${target}`);
      console.log("Future scans will only report findings not present in the baseline.");
      process.exitCode = 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`chainlink-audit: ${message}`);
      process.exitCode = 2;
    }
  });

program
  .command("triage")
  .argument("<report.json>", "JSON report produced by chainlink-audit scan --format json")
  .option("--out <file>", "Write triage markdown to a file instead of stdout")
  .description("Convert a JSON scan report into a manual triage checklist")
  .action(async (reportPath: string, options: { out?: string }) => {
    try {
      const raw = await fs.readFile(reportPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ScanResult>;
      if (!Array.isArray(parsed.findings) || typeof parsed.targetPath !== "string") {
        throw new Error("Input does not look like a chainlink-audit JSON report");
      }

      const output = renderTriageMarkdown(parsed as ScanResult);
      if (options.out) {
        await fs.writeFile(options.out, `${output}\n`, "utf8");
      } else {
        console.log(output);
      }
      process.exitCode = 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`chainlink-audit: ${message}`);
      process.exitCode = 2;
    }
  });

program.command("init").description(`Create ${configFileName} with recommended defaults`).action(async () => {
  try {
    await writeDefaultConfig();
    console.log(`Created ${configFileName}`);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "EEXIST") {
      console.error(`chainlink-audit: ${configFileName} already exists`);
      process.exitCode = 1;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`chainlink-audit: ${message}`);
    process.exitCode = 2;
  }
});

program.command("rules").description("List available MVP rules").action(() => {
  for (const rule of rules) {
    const metadata = rule.metadata;
    console.log(`${metadata.ruleId} [${metadata.severity} potential impact] ${metadata.product} - ${metadata.title}`);
  }
});

program.command("version").description("Print CLI version").action(() => {
  console.log(version);
});

program.parseAsync();
