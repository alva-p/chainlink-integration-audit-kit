import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, loadConfig, writeDefaultConfig } from "../src/config.js";
import { renderHtml } from "../src/reporters/html.js";
import { renderMarkdown } from "../src/reporters/markdown.js";
import { renderText } from "../src/reporters/text.js";
import { rules } from "../src/rules/index.js";
import { scanPath } from "../src/scanner.js";

async function fixture(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chainlink-audit-"));
  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      const fullPath = path.join(dir, file);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
    }),
  );
  return dir;
}

describe("rules metadata", () => {
  it("lists MVP rules", () => {
    expect(rules.map((rule) => rule.metadata.ruleId)).toEqual(
      expect.arrayContaining([
        "CL-DF-001",
        "CL-DF-002",
        "CL-DF-003",
        "CL-DF-004",
        "CL-CCIP-001",
        "CL-CCIP-002",
        "CL-CCIP-003",
        "CL-CCIP-004",
        "CL-CCIP-005",
        "CL-VRF-001",
        "CL-VRF-002",
        "CL-VRF-003",
        "CL-AUTO-001",
        "CL-AUTO-002",
        "CL-AUTO-003",
        "CL-FN-001",
        "CL-FN-002",
        "CL-FN-003",
      ]),
    );
  });
});

describe("scanPath", () => {
  it("detects Data Feed freshness and positive answer leads", async () => {
    const dir = await fixture({
      "Feed.sol": `
        contract Feed {
          function read() external view returns (uint256) {
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("data-feeds");
    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-DF-001");
    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-DF-002");
    expect(result.findings[0]).toHaveProperty("manualReviewRequired", true);
  });

  it("uses default excludes for noisy test and mock directories", async () => {
    const dir = await fixture({
      "contracts/Feed.sol": `
        contract Feed {
          function read() external view returns (uint256) {
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `,
      "test/FeedTest.sol": `
        contract FeedTest {
          function read() external view returns (uint256) {
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `,
      "mocks/MockFeed.sol": `
        contract MockFeed {
          function read() external view returns (uint256) {
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.scannedFiles).toBe(1);
    expect(
      result.findings.every((finding) => finding.file.split(path.sep).join("/").includes("contracts/Feed.sol")),
    ).toBe(true);
  });

  it("loads project config and filters by minSeverity", async () => {
    const dir = await fixture({
      ".chainlink-audit.json": JSON.stringify({
        exclude: [],
        format: "html",
        minSeverity: "high",
      }),
      "Auto.sol": `
        contract Auto {
          function checkUpkeep(bytes calldata) external returns (bool, bytes memory) {}
          function performUpkeep(bytes calldata performData) external {
            uint256 id = abi.decode(performData, (uint256));
            counter += id;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.config.format).toBe("html");
    expect(result.config.minSeverity).toBe("high");
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(["CL-AUTO-001"]);
  });

  it("detects L2 Data Feed sequencer uptime lead", async () => {
    const dir = await fixture({
      "BaseOracle.sol": `
        // deploy: base
        contract BaseOracle {
          function read() external view returns (uint256) {
            (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
            require(answer > 0);
            require(block.timestamp - updatedAt <= maxStaleness);
            return uint256(answer);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-DF-004");
  });

  it("detects CCIP receiver leads", async () => {
    const dir = await fixture({
      "Receiver.sol": `
        contract Receiver {
          function _ccipReceive(Client.Any2EVMMessage calldata message) internal {
            (address account, uint256 amount) = abi.decode(message.data, (address, uint256));
            credited[account] += amount;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("ccip");
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["CL-CCIP-001", "CL-CCIP-002", "CL-CCIP-003", "CL-CCIP-004", "CL-CCIP-005"]),
    );
  });

  it("detects VRF leads", async () => {
    const dir = await fixture({
      "VRF.sol": `
        contract VRF {
          function roll() external {
            COORDINATOR.requestRandomWords(keyHash, subId, 3, 100000, 1);
          }
          function fulfillRandomWords(uint256 requestId, uint256[] memory words) internal {
            require(words[0] > 0);
            randomResult = words[0];
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("vrf");
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["CL-VRF-001", "CL-VRF-002", "CL-VRF-003"]),
    );
  });

  it("detects Automation leads", async () => {
    const dir = await fixture({
      "Auto.sol": `
        contract Auto {
          function checkUpkeep(bytes calldata) external returns (bool, bytes memory) {}
          function performUpkeep(bytes calldata performData) external {
            uint256 id = abi.decode(performData, (uint256));
            counter += id;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("automation");
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["CL-AUTO-001", "CL-AUTO-002", "CL-AUTO-003"]),
    );
  });

  it("detects Functions/CRE leads", async () => {
    const dir = await fixture({
      ".chainlink-audit.json": JSON.stringify({
        exclude: [],
        format: "text",
        minSeverity: "info",
      }),
      "FunctionsConsumer.sol": `
        contract FunctionsConsumer is FunctionsClient {
          string sourceCode = "const apiKey = secrets.apiKey; const r = await Functions.makeHttpRequest({ url: 'https://api.example.com' });";
          function send() external { sendRequest(sourceCode); }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("functions-cre");
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["CL-FN-001", "CL-FN-002"]),
    );
  });
});

describe("config", () => {
  it("writes and loads the default config", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "chainlink-audit-config-"));
    const configPath = path.join(dir, ".chainlink-audit.json");

    await writeDefaultConfig(configPath);
    const config = await loadConfig(dir);

    expect(config).toEqual(defaultConfig);
  });
});

describe("reporters", () => {
  it("renders text, markdown, and HTML reports", async () => {
    const dir = await fixture({
      "Feed.sol": `
        contract Feed {
          function read() external view returns (uint256) {
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `,
    });
    const result = await scanPath(dir);
    const text = renderText(result);
    const markdown = renderMarkdown(result);
    const html = renderHtml(result);

    expect(text).toContain("Chainlink Integration Audit Kit");
    expect(text).toContain("Excluded paths");
    expect(text).toContain("Manual review required");
    expect(markdown).toContain("# Chainlink Integration Audit Report");
    expect(markdown).toContain("Excluded paths");
    expect(markdown).toContain("potential issues");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Chainlink Integration Audit Report");
    expect(html).toContain("Potential issue:");
    expect(html).toContain("data-theme");
    expect(html).toContain("theme-toggle");

    const reportPath = path.join(dir, "report.md");
    await writeFile(reportPath, markdown);
    await expect(readFile(reportPath, "utf8")).resolves.toContain("CL-DF-001");
  });
});
