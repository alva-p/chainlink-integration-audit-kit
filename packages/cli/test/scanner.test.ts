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
import { writeBaseline } from "../src/baseline.js";
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
        "CL-DF-005",
        "CL-DF-006",
        "CL-DF-007",
        "CL-VRF-004",
        "CL-DS-001",
        "CL-DS-002",
        "CL-DS-003",
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

  it("does not flag CCIP receiver that delegates validation to this.processMessage() (Aave GHO pattern)", async () => {
    const dir = await fixture({
      "CcipBridge.sol": `
        contract CcipBridge is CCIPReceiver {
          mapping(uint64 => bytes) private _destinations;

          function ccipReceive(Client.Any2EVMMessage calldata message) external override onlyRouter {
            try this.processMessage(message) {} catch (bytes memory err) {
              _failedMessages[message.messageId] = true;
              emit BridgeMessageFailed(message.messageId, err);
            }
          }

          function processMessage(Client.Any2EVMMessage calldata message) external onlySelf {
            if (keccak256(_destinations[message.sourceChainSelector]) != keccak256(message.sender)) {
              revert UnknownSourceDestination();
            }
            uint256 amount = message.destTokenAmounts[0].amount;
            IERC20(TOKEN).safeTransfer(COLLECTOR, amount);
          }
        }
      `,
    });

    const result = await scanPath(dir);
    const ruleIds = result.findings.map((f) => f.ruleId);

    expect(ruleIds).not.toContain("CL-CCIP-001");
    expect(ruleIds).not.toContain("CL-CCIP-002");
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

  it("detects deprecated latestAnswer() usage (CL-DF-005)", async () => {
    const dir = await fixture({
      "PriceChecker.sol": `
        contract PriceChecker {
          IPrice public priceFeed;
          function getPrice() external view returns (int256) {
            int256 price = priceFeed.latestAnswer();
            require(price > 0);
            return price;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("data-feeds");
    expect(result.findings.map((f) => f.ruleId)).toContain("CL-DF-005");
    expect(result.findings.find((f) => f.ruleId === "CL-DF-005")).toHaveProperty("confidence", "high");
  });

  it("does not flag latestAnswer() in an aggregator wrapper (CL-DF-005)", async () => {
    const dir = await fixture({
      "FeedWrapper.sol": `
        contract FeedWrapper {
          function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
            int256 answer = underlying.latestAnswer();
            return (0, answer, 0, block.timestamp, 0);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).not.toContain("CL-DF-005");
  });

  it("detects missing answeredInRound completeness check (CL-DF-006)", async () => {
    const dir = await fixture({
      "Oracle.sol": `
        contract Oracle {
          function getPrice() external view returns (uint256) {
            (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
            require(updatedAt != 0);
            require(block.timestamp - updatedAt <= maxStaleness);
            require(answer > 0);
            return uint256(answer);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).toContain("CL-DF-006");
  });

  it("does not flag latestRoundData() when answeredInRound >= roundId is validated (CL-DF-006)", async () => {
    const dir = await fixture({
      "SafeOracle.sol": `
        contract SafeOracle {
          function getPrice() external view returns (uint256) {
            (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();
            require(answeredInRound >= roundId, "stale round");
            require(updatedAt != 0);
            require(answer > 0);
            return uint256(answer);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).not.toContain("CL-DF-006");
  });

  it("detects cached aggregator minAnswer/maxAnswer bounds (CL-DF-007)", async () => {
    const dir = await fixture({
      "DepositReceipt.sol": `
        contract DepositReceipt {
          int192 public tokenMinPrice;
          int192 public tokenMaxPrice;
          constructor(address priceFeed) {
            IAccessControlledOffchainAggregator aggregator =
              IAccessControlledOffchainAggregator(IAggregatorV3(priceFeed).aggregator());
            tokenMinPrice = aggregator.minAnswer();
            tokenMaxPrice = aggregator.maxAnswer();
          }
          function getOraclePrice() external view returns (uint256) {
            (, int256 answer,,,) = priceFeed.latestRoundData();
            require(int192(answer) >= tokenMinPrice && int192(answer) <= tokenMaxPrice);
            return uint256(int256(answer));
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).toContain("CL-DF-007");
  });

  it("does not flag aggregator bounds read dynamically each call (CL-DF-007)", async () => {
    const dir = await fixture({
      "DynamicOracle.sol": `
        contract DynamicOracle {
          function getOraclePrice(address priceFeed) external view returns (uint256) {
            IAccessControlledOffchainAggregator aggregator =
              IAccessControlledOffchainAggregator(IAggregatorV3(priceFeed).aggregator());
            int192 minAnswer = aggregator.minAnswer();
            int192 maxAnswer = aggregator.maxAnswer();
            (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(priceFeed).latestRoundData();
            require(int192(answer) >= minAnswer && int192(answer) <= maxAnswer);
            return uint256(int256(answer));
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).not.toContain("CL-DF-007");
  });

  it("detects VRF redraw pattern that enables result discarding (CL-VRF-004)", async () => {
    const dir = await fixture({
      "NFTRaffle.sol": `
        contract NFTRaffle is VRFConsumerBaseV2 {
          uint256 public currentChainlinkRequestId;
          uint256 public drawTimelock;

          function startDraw() external onlyOwner {
            currentChainlinkRequestId = coordinator.requestRandomWords(keyHash, subId, 3, 100000, 1);
            drawTimelock = block.timestamp + drawBufferTime;
          }

          function redraw() external onlyOwner {
            if (drawTimelock >= block.timestamp) revert STILL_IN_WAITING_PERIOD();
            currentChainlinkRequestId = coordinator.requestRandomWords(keyHash, subId, 3, 100000, 1);
            drawTimelock = block.timestamp + drawBufferTime;
          }

          function fulfillRandomWords(uint256 requestId, uint256[] memory words) internal override {
            if (requestId != currentChainlinkRequestId) revert REQUEST_DOES_NOT_MATCH_CURRENT_ID();
            winner = words[0] % totalEntries;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("vrf");
    expect(result.findings.map((f) => f.ruleId)).toContain("CL-VRF-004");
  });

  it("does not flag VRF consumer with no redraw mechanism (CL-VRF-004)", async () => {
    const dir = await fixture({
      "Lottery.sol": `
        contract Lottery is VRFConsumerBaseV2 {
          uint256 public s_requestId;

          function requestRandom() external {
            s_requestId = coordinator.requestRandomWords(keyHash, subId, 3, 100000, 1);
          }

          function fulfillRandomWords(uint256 requestId, uint256[] memory words) internal override {
            if (requestId != s_requestId) revert UnknownRequest();
            winner = words[0] % totalEntries;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).not.toContain("CL-VRF-004");
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

  it("detects missing Functions error handling (CL-FN-003)", async () => {
    const dir = await fixture({
      ".chainlink-audit.json": JSON.stringify({ exclude: [], format: "text", minSeverity: "info" }),
      "SimpleConsumer.sol": `
        contract SimpleConsumer is FunctionsClient {
          function send() external {
            sendRequest(sourceCode, new string[](0), new bytes[](0), subscriptionId, 100000);
          }
          function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory) internal override {
            latestResponse = response;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).toContain("CL-FN-003");
  });

  it("detects Data Streams report used without on-chain verification (CL-DS-001)", async () => {
    const dir = await fixture({
      "StreamsConsumer.sol": `
        contract StreamsConsumer is ILogAutomation {
          function performUpkeep(bytes calldata performData) external {
            (bytes[] memory signedReports,) = abi.decode(performData, (bytes[], bytes));
            bytes memory unverifiedReport = signedReports[0];
            BasicReport memory report = abi.decode(unverifiedReport, (BasicReport));
            latestPrice = report.price;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.products).toContain("data-streams");
    expect(result.findings.map((f) => f.ruleId)).toContain("CL-DS-001");
  });

  it("does not flag Data Streams report when verifier.verify() is called (CL-DS-001)", async () => {
    const dir = await fixture({
      "SafeStreamsConsumer.sol": `
        contract SafeStreamsConsumer is ILogAutomation {
          IVerifierProxy public verifier;
          function performUpkeep(bytes calldata performData) external {
            (bytes[] memory signedReports,) = abi.decode(performData, (bytes[], bytes));
            bytes memory verifiedReport = verifier.verify(signedReports[0], abi.encode(feeAddress));
            BasicReport memory report = abi.decode(verifiedReport, (BasicReport));
            latestPrice = report.price;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).not.toContain("CL-DS-001");
  });

  it("detects Data Streams price used without timestamp validation (CL-DS-002)", async () => {
    const dir = await fixture({
      "UncheckedStreams.sol": `
        contract UncheckedStreams {
          IVerifierProxy public verifier;
          function getPrice(bytes memory rawReport) external returns (int192) {
            bytes memory verifiedReport = verifier.verify(rawReport, abi.encode(feeAddress));
            BasicReport memory report = abi.decode(verifiedReport, (BasicReport));
            return report.price;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).toContain("CL-DS-002");
  });

  it("does not flag Data Streams when validFromTimestamp is checked (CL-DS-002)", async () => {
    const dir = await fixture({
      "FreshStreams.sol": `
        contract FreshStreams {
          IVerifierProxy public verifier;
          uint32 public constant MAX_AGE = 60;
          function getPrice(bytes memory rawReport) external returns (int192) {
            bytes memory verifiedReport = verifier.verify(rawReport, abi.encode(feeAddress));
            BasicReport memory report = abi.decode(verifiedReport, (BasicReport));
            require(block.timestamp - report.validFromTimestamp <= MAX_AGE, "Stale report");
            require(block.timestamp <= report.expiresAt, "Expired report");
            return report.price;
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).not.toContain("CL-DS-002");
  });

  it("detects bid/ask used in execution context instead of benchmark price (CL-DS-003)", async () => {
    const dir = await fixture({
      "BidAskExecution.sol": `
        contract BidAskExecution {
          IVerifierProxy public verifier;
          function executeTrade(bytes memory rawReport, uint256 amount) external {
            bytes memory verified = verifier.verify(rawReport, abi.encode(feeAddress));
            BasicReport memory report = abi.decode(verified, (BasicReport));
            require(block.timestamp <= report.expiresAt);
            uint256 cost = uint256(int256(report.bid)) * amount / 1e18;
            token.transfer(msg.sender, cost);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).toContain("CL-DS-003");
  });

  it("does not flag bid/ask when report.price is also used (spread logic) (CL-DS-003)", async () => {
    const dir = await fixture({
      "SpreadCheck.sol": `
        contract SpreadCheck {
          IVerifierProxy public verifier;
          function executeTrade(bytes memory rawReport, uint256 amount, bool isBuy) external {
            bytes memory verified = verifier.verify(rawReport, abi.encode(feeAddress));
            BasicReport memory report = abi.decode(verified, (BasicReport));
            int192 executionPrice = isBuy ? report.ask : report.bid;
            int192 midPrice = report.price;
            require(executionPrice <= midPrice * 1005 / 1000, "Excessive spread");
            token.transfer(msg.sender, amount);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings.map((f) => f.ruleId)).not.toContain("CL-DS-003");
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

describe("suppressions", () => {
  const feedWithLead = `
        contract Feed {
          function read() external view returns (uint256) {
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `;

  it("suppresses all rules on a line with a bare chainlink-audit-ignore comment", async () => {
    const dir = await fixture({
      "Feed.sol": `
        contract Feed {
          function read() external view returns (uint256) {
            // chainlink-audit-ignore -- wrapper validates upstream
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `,
    });

    const result = await scanPath(dir);

    expect(result.findings).toHaveLength(0);
    expect(result.suppressed.inline).toBeGreaterThan(0);
  });

  it("suppresses only the listed rule IDs", async () => {
    const dir = await fixture({
      "Feed.sol": `
        contract Feed {
          function read() external view returns (uint256) {
            // chainlink-audit-ignore: CL-DF-001 -- freshness handled by caller
            (, int256 answer,,,) = feed.latestRoundData();
            return uint256(answer);
          }
        }
      `,
    });

    const result = await scanPath(dir);
    const ruleIds = result.findings.map((finding) => finding.ruleId);

    expect(ruleIds).not.toContain("CL-DF-001");
    expect(ruleIds).toContain("CL-DF-002");
    expect(result.suppressed.inline).toBe(1);
  });

  it("baselines existing findings and only reports new ones", async () => {
    const dir = await fixture({ "Feed.sol": feedWithLead });

    const before = await scanPath(dir);
    expect(before.findings.length).toBeGreaterThan(0);
    await writeBaseline(dir, before.findings);

    const after = await scanPath(dir);
    expect(after.findings).toHaveLength(0);
    expect(after.suppressed.baseline).toBe(before.findings.length);

    // A new lead in a new file is not covered by the baseline.
    await writeFile(path.join(dir, "NewFeed.sol"), feedWithLead.replace("contract Feed", "contract NewFeed"));
    const withNewFile = await scanPath(dir);
    expect(withNewFile.findings.length).toBeGreaterThan(0);
    expect(withNewFile.findings.every((finding) => finding.file.endsWith("NewFeed.sol"))).toBe(true);
  });

  it("survives line shifts because fingerprints anchor on line content", async () => {
    const dir = await fixture({ "Feed.sol": feedWithLead });
    const before = await scanPath(dir);
    await writeBaseline(dir, before.findings);

    await writeFile(path.join(dir, "Feed.sol"), `// SPDX-License-Identifier: MIT\n// shifted by two lines\n${feedWithLead}`);
    const after = await scanPath(dir);

    expect(after.findings).toHaveLength(0);
    expect(after.suppressed.baseline).toBe(before.findings.length);
  });

  it("skips the baseline when applyBaseline is false", async () => {
    const dir = await fixture({ "Feed.sol": feedWithLead });
    const before = await scanPath(dir);
    await writeBaseline(dir, before.findings);

    const unfiltered = await scanPath(dir, { applyBaseline: false });
    expect(unfiltered.findings.length).toBe(before.findings.length);
  });
});
