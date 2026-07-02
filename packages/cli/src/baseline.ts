import { promises as fs } from "node:fs";
import path from "node:path";
import type { Finding } from "./types.js";

export const baselineFileName = ".chainlink-audit-baseline.json";

// Fingerprint on line *content*, not line number, so unrelated edits that shift
// lines don't invalidate the baseline.
export function makeFingerprint(finding: Pick<Finding, "ruleId" | "file">, lines: string[], line: number): string {
  const anchor = (lines[line - 1] ?? "").trim();
  const file = finding.file.split(path.sep).join("/");
  return `${finding.ruleId}:${file}:${anchor}`;
}

export async function loadBaseline(scanRoot: string): Promise<Set<string> | null> {
  try {
    const raw = await fs.readFile(path.join(scanRoot, baselineFileName), "utf8");
    const parsed = JSON.parse(raw) as { fingerprints?: unknown };
    if (!Array.isArray(parsed.fingerprints)) return null;
    return new Set(parsed.fingerprints.filter((entry): entry is string => typeof entry === "string"));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${baselineFileName}: ${message}`);
  }
}

export async function writeBaseline(scanRoot: string, findings: Finding[]): Promise<string> {
  const fingerprints = [...new Set(findings.map((finding) => finding.fingerprint).filter(Boolean))].sort();
  const output = `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), fingerprints }, null, 2)}\n`;
  const target = path.join(scanRoot, baselineFileName);
  await fs.writeFile(target, output, "utf8");
  return target;
}
