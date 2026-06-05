#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { Command } from "commander";
import {
  configFileName,
  loadConfig,
  parseOutputFormat,
  parseSeverity,
  writeDefaultConfig,
} from "./config.js";
import { renderJson } from "./reporters/json.js";
import { renderHtml } from "./reporters/html.js";
import { renderMarkdown } from "./reporters/markdown.js";
import { renderText } from "./reporters/text.js";
import { rules } from "./rules/index.js";
import { scanPath } from "./scanner.js";
import type { OutputFormat } from "./types.js";

const version = "0.1.0";

function render(format: OutputFormat, result: Awaited<ReturnType<typeof scanPath>>): string {
  if (format === "json") return renderJson(result);
  if (format === "markdown") return renderMarkdown(result);
  if (format === "html") return renderHtml(result);
  return renderText(result);
}

const program = new Command();

program
  .name("chainlink-audit")
  .description("CLI-first scanner for potential Chainlink integration risks in Solidity repositories.")
  .version(version);

program
  .command("scan")
  .argument("<path>", "Solidity file or repository path to scan")
  .option("--format <format>", "Output format: text, json, markdown, html")
  .option("--min-severity <severity>", "Minimum severity: info, low, medium, high")
  .option("--out <file>", "Write report to a file instead of stdout")
  .action(async (
    targetPath: string,
    options: { format?: string; minSeverity?: string; out?: string },
  ) => {
    try {
      const config = await loadConfig(targetPath);
      if (options.format) config.format = parseOutputFormat(options.format);
      if (options.minSeverity) config.minSeverity = parseSeverity(options.minSeverity);

      const format: OutputFormat = config.format;
      const result = await scanPath(targetPath, { config });
      const output = render(format, result);

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
    console.log(`${metadata.ruleId} [${metadata.severity}] ${metadata.product} - ${metadata.title}`);
  }
});

program.command("version").description("Print CLI version").action(() => {
  console.log(version);
});

program.parseAsync();
