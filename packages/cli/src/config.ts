import { promises as fs } from "node:fs";
import path from "node:path";
import type { AuditConfig, OutputFormat, Severity } from "./types.js";

export const configFileName = ".chainlink-audit.json";

export const defaultConfig: AuditConfig = {
  exclude: ["test/", "tests/", "mock/", "mocks/", "script/", "lib/"],
  format: "text",
  minSeverity: "low",
};

export function severityRank(severity: Severity): number {
  return {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
  }[severity];
}

export function parseOutputFormat(value: string): OutputFormat {
  if (value === "text" || value === "json" || value === "markdown" || value === "html") return value;
  throw new Error(`Unsupported format "${value}". Use text, json, markdown, or html.`);
}

export function parseSeverity(value: string): Severity {
  if (value === "info" || value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`Unsupported severity "${value}". Use info, low, medium, or high.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeConfig(raw: unknown): AuditConfig {
  if (!isRecord(raw)) return { ...defaultConfig };

  const exclude = Array.isArray(raw.exclude)
    ? raw.exclude.filter((entry): entry is string => typeof entry === "string")
    : defaultConfig.exclude;

  const format = typeof raw.format === "string" ? parseOutputFormat(raw.format) : defaultConfig.format;
  const minSeverity =
    typeof raw.minSeverity === "string" ? parseSeverity(raw.minSeverity) : defaultConfig.minSeverity;

  return {
    exclude,
    format,
    minSeverity,
  };
}

export async function loadConfig(startPath: string = process.cwd()): Promise<AuditConfig> {
  const absoluteStart = path.resolve(startPath);
  let current = absoluteStart;

  try {
    const stat = await fs.stat(current);
    if (stat.isFile()) current = path.dirname(current);
  } catch {
    current = process.cwd();
  }

  while (true) {
    const candidate = path.join(current, configFileName);
    try {
      const raw = await fs.readFile(candidate, "utf8");
      return normalizeConfig(JSON.parse(raw));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read ${candidate}: ${message}`);
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return { ...defaultConfig };
    current = parent;
  }
}

export async function writeDefaultConfig(targetPath: string = configFileName): Promise<void> {
  const output = `${JSON.stringify(defaultConfig, null, 2)}\n`;
  await fs.writeFile(targetPath, output, { encoding: "utf8", flag: "wx" });
}
