import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "../src/config.js";
import {
  summarizeBenchmarkResults,
  summarizeScanResults,
  type EcosystemBenchmarkManifest,
} from "../src/benchmark.js";
import { scanPath } from "../src/scanner.js";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = path.resolve(packageRoot, "../..");
const manifestPath = path.join(packageRoot, "benchmarks/ecosystem-repos.json");
const defaultCacheDir = path.join(repoRoot, "cache/ecosystem-benchmark");

function parseArgs(argv: string[]): { cacheDir: string; out?: string; skipClone: boolean } {
  const options = { cacheDir: defaultCacheDir, out: undefined as string | undefined, skipClone: false };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--cache-dir") {
      options.cacheDir = path.resolve(argv[++index] ?? "");
    } else if (arg === "--out") {
      options.out = path.resolve(argv[++index] ?? "");
    } else if (arg === "--skip-clone") {
      options.skipClone = true;
    } else {
      throw new Error(`Unknown option "${arg}"`);
    }
  }

  return options;
}

function run(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function checkoutDirectory(cacheDir: string, githubUrl: string): string {
  const name = githubUrl.replace(/\.git$/, "").split("/").slice(-2).join("__");
  return path.join(cacheDir, name);
}

async function checkoutRepository(cacheDir: string, githubUrl: string, commit: string): Promise<string> {
  const directory = checkoutDirectory(cacheDir, githubUrl);
  await fs.mkdir(cacheDir, { recursive: true });

  if (!(await pathExists(path.join(directory, ".git")))) {
    await run("git", ["clone", "--filter=blob:none", "--no-checkout", githubUrl, directory]);
  }

  await run("git", ["fetch", "--depth=1", "origin", commit], directory);
  await run("git", ["checkout", "--detach", commit], directory);
  return directory;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as EcosystemBenchmarkManifest;
  const scanResults = [];

  for (const repository of manifest.repositories) {
    const checkoutPath = options.skipClone
      ? checkoutDirectory(options.cacheDir, repository.githubUrl)
      : await checkoutRepository(options.cacheDir, repository.githubUrl, repository.commit);
    const targetPath = path.join(checkoutPath, repository.scanPath ?? ".");
    const result = await scanPath(targetPath, {
      config: {
        ...defaultConfig,
        exclude: [...defaultConfig.exclude, "node_modules/", "artifacts/", "cache/", "out/", "broadcast/"],
      },
    });
    scanResults.push(result);
    console.log(`${repository.project}: ${result.scannedFiles} Solidity files, ${result.findings.length} leads`);
  }

  const projects = summarizeScanResults(manifest.repositories, scanResults);
  const summary = summarizeBenchmarkResults(projects);
  const report = {
    source: manifest.source,
    selectionDate: manifest.selectionDate,
    generatedAt: new Date().toISOString(),
    summary,
    projects,
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    await fs.mkdir(path.dirname(options.out), { recursive: true });
    await fs.writeFile(options.out, output);
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
