import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { summarizeBenchmarkResults, type EcosystemBenchmarkManifest } from "../src/benchmark.js";
import { defaultConfig, loadConfig, writeDefaultConfig } from "../src/config.js";
import { renderHtml } from "../src/reporters/html.js";
import { renderMarkdown } from "../src/reporters/markdown.js";
import { renderSarif } from "../src/reporters/sarif.js";
import { renderText } from "../src/reporters/text.js";
import { renderTriageMarkdown } from "../src/reporters/triage.js";
import { rules } from "../src/rules/index.js";
import { scanPath } from "../src/scanner.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
        "CL-CCIP-006",
        "CL-CCIP-007",
        "CL-CCIP-008",
        "CL-CCIP-009",
        "CL-CCIP-010",
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

describe("ecosystem benchmark", () => {
  it("tracks pinned Chainlink Ecosystem repositories outside the original manual audit sample", async () => {
    const manifestPath = path.join(packageRoot, "benchmarks/ecosystem-repos.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as EcosystemBenchmarkManifest;
    const repositories = manifest.repositories;
    const projects = new Set(repositories.map((repository) => repository.project));
    const githubUrls = new Set(repositories.map((repository) => repository.githubUrl));
    const ecosystemProducts = new Set(repositories.flatMap((repository) => repository.ecosystemProducts));

    expect(manifest.source).toBe("https://www.chainlinkecosystem.com/ecosystem");
    expect(repositories.length).toBeGreaterThanOrEqual(58);
    expect(projects.size).toBe(repositories.length);
    expect(githubUrls.size).toBe(repositories.length);
    expect([...ecosystemProducts]).toEqual(expect.arrayContaining(["data-feeds", "ccip", "automation", "data-streams"]));

    for (const repository of repositories) {
      expect(repository.ecosystemUrl).toMatch(/^https:\/\/www\.chainlinkecosystem\.com\/ecosystem\//);
      expect(repository.githubUrl).toMatch(/^https:\/\/github\.com\/.+\/.+\.git$/);
      expect(repository.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(repository.scanPath ?? ".").not.toContain("..");
      expect(manifest.previousManualAuditSample).not.toContain(repository.project);
    }
  });

  it("summarizes benchmark scan results by rule and product", () => {
    const summary = summarizeBenchmarkResults([
      {
        project: "Aave",
        githubUrl: "https://github.com/aave/aave-v3-core.git",
        commit: "782f51917056a53a2c228701058a6c3fb233684a",
        scannedFiles: 10,
        scannerProducts: ["data-feeds", "ccip"],
        totalFindings: 3,
        findingsByRule: {
          "CL-DF-001": 2,
          "CL-CCIP-004": 1,
        },
      },
      {
        project: "GMX",
        githubUrl: "https://github.com/gmx-io/gmx-synthetics.git",
        commit: "919da1919d950c3e5218084ba9ef3a4a0da3de89",
        scannedFiles: 4,
        scannerProducts: ["data-streams"],
        totalFindings: 1,
        findingsByRule: {
          "CL-DF-001": 1,
        },
      },
    ]);

    expect(summary).toEqual({
      repositoryCount: 2,
      scannedFiles: 14,
      totalFindings: 4,
      scannerProducts: ["ccip", "data-feeds", "data-streams"],
      findingsByRule: {
        "CL-DF-001": 3,
        "CL-CCIP-004": 1,
      },
      findingsByProduct: {
        "data-feeds": 3,
        ccip: 1,
      },
    });
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

  it("skips broken symlinks while collecting Solidity files", async () => {
    const dir = await fixture({
      "contracts/Feed.sol": `
        contract Feed {
          function read() external view returns (uint256) {
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `,
    });
    await symlink(path.join(dir, "missing-submodule"), path.join(dir, "lib"));

    const result = await scanPath(dir);

    expect(result.scannedFiles).toBe(1);
    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-DF-001");
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

  it("does not suppress CCIP-001 when sourceChainSelector only appears in event emissions", async () => {
    const dir = await fixture({
      "Receiver.sol": `
        contract Receiver is CCIPReceiver {
          event Received(uint64 sourceChainSelector);
          function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
            emit Received(message.sourceChainSelector);
            if (someCondition) revert InvalidAction();
            (address account) = abi.decode(message.data, (address));
            token.mint(account, 1 ether);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).toContain("CL-CCIP-001");
  });

  it("does not suppress CCIP-002 when sender only appears inside an emit call", async () => {
    const dir = await fixture({
      "Receiver.sol": `
        contract Receiver is CCIPReceiver {
          function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
            emit MessageReceived(message.sender, message.sourceChainSelector);
            if (someOtherCondition) revert InvalidAction();
            token.mint(fixedRecipient, 1 ether);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).toContain("CL-CCIP-002");
  });

  it("recognizes CCIP source validation in entrypoint modifiers", async () => {
    const dir = await fixture({
      "Receiver.sol": `
        contract Receiver {
          function ccipReceive(Client.Any2EVMMessage calldata message)
            external
            onlyRouter
            onlyAllowlisted(message.sourceChainSelector, abi.decode(message.sender, (address)))
          {
            _ccipReceive(message);
          }

          function _ccipReceive(Client.Any2EVMMessage calldata message) internal {
            (address account, uint256 amount) = abi.decode(message.data, (address, uint256));
            credited[account] += amount;
          }
        }
      `,
    });

    const result = await scanPath(dir);
    const ruleIds = result.findings.map((finding) => finding.ruleId);

    expect(ruleIds).not.toContain("CL-CCIP-001");
    expect(ruleIds).not.toContain("CL-CCIP-002");
    expect(ruleIds).not.toContain("CL-CCIP-003");
  });

  it("does not flag abstract CCIP receiver base contracts as application receivers", async () => {
    const dir = await fixture({
      "CCIPReceiver.sol": `
        abstract contract CCIPReceiver {
          function ccipReceive(Client.Any2EVMMessage calldata message) external onlyRouter {
            _ccipReceive(message);
          }

          function _ccipReceive(Client.Any2EVMMessage memory message) internal virtual;
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("ccip");
    expect(result.findings.map((finding) => finding.ruleId)).not.toEqual(
      expect.arrayContaining(["CL-CCIP-001", "CL-CCIP-002", "CL-CCIP-003"]),
    );
  });

  it("does not flag CCIP receiver interfaces as application receivers", async () => {
    const dir = await fixture({
      "IAny2EVMMessageReceiver.sol": `
        interface IAny2EVMMessageReceiver {
          function ccipReceive(Client.Any2EVMMessage calldata message) external;
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("ccip");
    expect(result.findings.map((finding) => finding.ruleId)).not.toEqual(
      expect.arrayContaining(["CL-CCIP-001", "CL-CCIP-002", "CL-CCIP-003"]),
    );
  });

  it("recognizes delegated CCIP validation in receiver libraries", async () => {
    const dir = await fixture({
      "modules/CcipReceiverModule.sol": `
        import "../storage/CrossChain.sol";

        contract CcipReceiverModule is IAny2EVMMessageReceiver {
          function ccipReceive(Client.Any2EVMMessage memory message) external {
            CrossChain.processCcipReceive(CrossChain.load(), message);
          }
        }
      `,
      "storage/CrossChain.sol": `
        library CrossChain {
          error NotCcipRouter(address);
          error UnsupportedNetwork(uint64);
          struct Data {
            address ccipRouter;
            mapping(uint64 => uint64) ccipSelectorToChainId;
            SupportedNetworks supportedNetworks;
          }
          struct SupportedNetworks {
            uint256 length;
          }
          function load() internal pure returns (Data storage crossChain) {}
          function processCcipReceive(Data storage self, Client.Any2EVMMessage memory data) internal {
            if (msg.sender != address(self.ccipRouter)) {
              revert NotCcipRouter(msg.sender);
            }
            uint64 sourceChainId = self.ccipSelectorToChainId[data.sourceChainSelector];
            if (sourceChainId == 0) {
              revert UnsupportedNetwork(sourceChainId);
            }
            address sender = abi.decode(data.sender, (address));
            if (sender != address(this)) {
              revert Unauthorized(sender);
            }
          }
        }
      `,
    });

    const result = await scanPath(dir);
    const ruleIds = result.findings.map((finding) => finding.ruleId);

    expect(ruleIds).not.toContain("CL-CCIP-001");
    expect(ruleIds).not.toContain("CL-CCIP-002");
    expect(ruleIds).not.toContain("CL-CCIP-003");
  });

  it("recognizes router validation from transitive CCIPReceiver inheritance via parent contract", async () => {
    const dir = await fixture({
      "BaseVault.sol": `
        abstract contract BaseVault is Pausable, CCIPReceiver {
          constructor(address router) CCIPReceiver(router) {}
        }
      `,
      "ChildVault.sol": `
        import "./BaseVault.sol";
        contract ChildVault is BaseVault, IChildVault {
          function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
            address sender = abi.decode(message.sender, (address));
            if (sender != trustedSender[message.sourceChainSelector]) revert Unauthorized();
            token.mint(receiver, 1 ether);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("CL-CCIP-003");
  });

  it("recognizes router validation from CCIPReceiver inheritance with multiple bases", async () => {
    const dir = await fixture({
      "UpgradeableReceiver.sol": `
        contract UpgradeableReceiver is Initializable, Ownable, CCIPReceiverUpgradeable {
          function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
            address sender = abi.decode(message.sender, (address));
            if (sender != trustedSender[message.sourceChainSelector]) revert Unauthorized();
            token.mint(receiver, 1 ether);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("CL-CCIP-003");
  });

  it("recognizes router validation in public ccipReceive before internal handling", async () => {
    const dir = await fixture({
      "GuardedReceiver.sol": `
        contract GuardedReceiver {
          address public router;
          function ccipReceive(Client.Any2EVMMessage calldata message) external {
            if (msg.sender != router) revert InvalidRouter();
            _ccipReceive(message);
          }
          function _ccipReceive(Client.Any2EVMMessage calldata message) internal {
            address sender = abi.decode(message.sender, (address));
            if (sender != trustedSender[message.sourceChainSelector]) revert Unauthorized();
            credited[sender] += 1;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("CL-CCIP-003");
  });

  it("detects CCIP token amount indexing without length checks", async () => {
    const dir = await fixture({
      "TokenReceiver.sol": `
        contract TokenReceiver is CCIPReceiver {
          function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
            Client.EVMTokenAmount[] memory tokenAmounts = message.destTokenAmounts;
            address token = tokenAmounts[0].token;
            uint256 amount = tokenAmounts[0].amount;
            credited[token] += amount;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-CCIP-006");
  });

  it("detects mutating CCIP receiver logic without messageId idempotency tracking", async () => {
    const dir = await fixture({
      "MintReceiver.sol": `
        contract MintReceiver is CCIPReceiver {
          function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
            address account = abi.decode(message.data, (address));
            token.mint(account, 1 ether);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-CCIP-007");
  });

  it("does not flag CCIP idempotency when messageId tracking is visible", async () => {
    const dir = await fixture({
      "TrackedReceiver.sol": `
        contract TrackedReceiver is CCIPReceiver {
          mapping(bytes32 => bool) public processedMessages;

          function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
            if (processedMessages[message.messageId]) revert DuplicateMessage();
            processedMessages[message.messageId] = true;
            address account = abi.decode(message.data, (address));
            token.mint(account, 1 ether);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("CL-CCIP-007");
  });

  it("detects CCIP Token Pool lockOrBurn without _validateLockOrBurn", async () => {
    const dir = await fixture({
      "BurnMintPool.sol": `
        contract BurnMintPool is TokenPool {
          function lockOrBurn(Pool.LockOrBurnInV1 calldata lockOrBurnIn) external returns (Pool.LockOrBurnOutV1 memory) {
            IToken(address(i_token)).burn(address(this), lockOrBurnIn.amount);
            return Pool.LockOrBurnOutV1({ destTokenAddress: getRemoteToken(lockOrBurnIn.remoteChainSelector), destPoolData: "" });
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("ccip");
    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-CCIP-008");
  });

  it("detects CCIP Token Pool releaseOrMint without _validateReleaseOrMint", async () => {
    const dir = await fixture({
      "BurnMintPool.sol": `
        contract BurnMintPool is TokenPool {
          function releaseOrMint(Pool.ReleaseOrMintInV1 calldata releaseOrMintIn) external returns (Pool.ReleaseOrMintOutV1 memory) {
            IToken(address(i_token)).mint(releaseOrMintIn.receiver, releaseOrMintIn.amount);
            return Pool.ReleaseOrMintOutV1({ destinationAmount: releaseOrMintIn.amount });
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("ccip");
    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-CCIP-009");
  });

  it("does not flag Token Pool when both validators are present", async () => {
    const dir = await fixture({
      "SafePool.sol": `
        contract SafePool is TokenPool {
          function lockOrBurn(Pool.LockOrBurnInV1 calldata lockOrBurnIn) external returns (Pool.LockOrBurnOutV1 memory) {
            _validateLockOrBurn(lockOrBurnIn);
            IToken(address(i_token)).burn(address(this), lockOrBurnIn.amount);
            return Pool.LockOrBurnOutV1({ destTokenAddress: getRemoteToken(lockOrBurnIn.remoteChainSelector), destPoolData: "" });
          }
          function releaseOrMint(Pool.ReleaseOrMintInV1 calldata releaseOrMintIn) external returns (Pool.ReleaseOrMintOutV1 memory) {
            _validateReleaseOrMint(releaseOrMintIn);
            IToken(address(i_token)).mint(releaseOrMintIn.receiver, releaseOrMintIn.amount);
            return Pool.ReleaseOrMintOutV1({ destinationAmount: releaseOrMintIn.amount });
          }
        }
      `,
    });

    const result = await scanPath(dir);
    const ruleIds = result.findings.map((finding) => finding.ruleId);

    expect(ruleIds).not.toContain("CL-CCIP-008");
    expect(ruleIds).not.toContain("CL-CCIP-009");
  });

  it("detects unsafe sourcePoolData decoding in releaseOrMint", async () => {
    const dir = await fixture({
      "RebasePool.sol": `
        contract RebasePool is TokenPool {
          function releaseOrMint(Pool.ReleaseOrMintInV1 calldata releaseOrMintIn) external returns (Pool.ReleaseOrMintOutV1 memory) {
            _validateReleaseOrMint(releaseOrMintIn);
            uint256 rate = abi.decode(releaseOrMintIn.sourcePoolData, (uint256));
            IToken(address(i_token)).mint(releaseOrMintIn.receiver, releaseOrMintIn.amount, rate);
            return Pool.ReleaseOrMintOutV1({ destinationAmount: releaseOrMintIn.amount });
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((finding) => finding.ruleId)).toContain("CL-CCIP-010");
  });

  it("does not flag abstract Token Pool base with non-standard name (e.g. BurnMintTokenPoolAbstract)", async () => {
    const dir = await fixture({
      "BurnMintTokenPoolAbstract.sol": `
        abstract contract BurnMintTokenPoolAbstract is BurnMintTokenPool {
          function lockOrBurn(Pool.LockOrBurnInV1 calldata lockOrBurnIn) external virtual returns (Pool.LockOrBurnOutV1 memory);
          function releaseOrMint(Pool.ReleaseOrMintInV1 calldata releaseOrMintIn) external virtual returns (Pool.ReleaseOrMintOutV1 memory);
        }
      `,
    });

    const result = await scanPath(dir);
    const ruleIds = result.findings.map((f) => f.ruleId);

    expect(ruleIds).not.toContain("CL-CCIP-008");
    expect(ruleIds).not.toContain("CL-CCIP-009");
  });

  it("does not flag ccipReceive that is a pure revert stub (e.g. EVM2EVMOffRamp guard)", async () => {
    const dir = await fixture({
      "OffRamp.sol": `
        contract EVM2EVMOffRamp {
          function ccipReceive(Client.Any2EVMMessage calldata) external pure {
            revert();
          }
        }
      `,
    });

    const result = await scanPath(dir);
    const ruleIds = result.findings.map((f) => f.ruleId);

    expect(ruleIds).not.toContain("CL-CCIP-001");
    expect(ruleIds).not.toContain("CL-CCIP-002");
    expect(ruleIds).not.toContain("CL-CCIP-003");
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
  it("renders text, markdown, HTML, and SARIF reports", async () => {
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
    const sarif = renderSarif(result);
    const triage = renderTriageMarkdown(result);
    const parsedSarif = JSON.parse(sarif);

    expect(text).toContain("Chainlink Integration Audit Kit");
    expect(text).toContain("Excluded paths");
    expect(text).toContain("Manual review required");
    expect(text).toContain("Confirmed vulnerability: no");
    expect(markdown).toContain("# Chainlink Integration Audit Report");
    expect(markdown).toContain("Excluded paths");
    expect(markdown).toContain("unverified risk leads");
    expect(markdown).toContain("Confirmed vulnerabilities: 0");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Chainlink Integration Audit Report");
    expect(html).toContain("Potential issue:");
    expect(html).toContain("Confirmed Vulnerabilities");
    expect(html).toContain("data-theme");
    expect(html).toContain("theme-toggle");
    expect(parsedSarif.version).toBe("2.1.0");
    expect(parsedSarif.runs[0].tool.driver.name).toBe("chainlink-audit");
    expect(parsedSarif.runs[0].results[0].ruleId).toBe("CL-DF-001");
    expect(parsedSarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toContain("Feed.sol");
    expect(triage).toContain("# Chainlink Audit Triage");
    expect(triage).toContain("False positive");
    expect(triage).toContain("Needs more context");

    const reportPath = path.join(dir, "report.md");
    await writeFile(reportPath, markdown);
    await expect(readFile(reportPath, "utf8")).resolves.toContain("CL-DF-001");
  });
});
