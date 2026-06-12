import type { Rule } from "../types.js";
import { escapeRegExp, extractFunctionBody, firstLineMatching, makeFinding } from "./helpers.js";

function hasAutomation(content: string): boolean {
  return /(AutomationCompatibleInterface|KeeperCompatibleInterface|function\s+checkUpkeep\b|function\s+performUpkeep\b)/.test(content);
}

function internalCallBodies(content: string, body: string): string {
  const calledNames = [...body.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)].map((match) => match[1]);
  return [...new Set(calledNames)]
    .map((name) => {
      const declaration = new RegExp(`function\\s+${escapeRegExp(name)}\\b[^{;]*\\b(internal|private)\\b`);
      return declaration.test(content) ? extractFunctionBody(content, name) : "";
    })
    .filter(Boolean)
    .join("\n");
}

export const automationRules: Rule[] = [
  {
    metadata: {
      ruleId: "CL-AUTO-001",
      product: "automation",
      severity: "high",
      title: "Potential performUpkeep without condition revalidation",
      description: "performUpkeep appears not to revalidate checkUpkeep conditions.",
    },
    scan(context) {
      if (!hasAutomation(context.content)) return [];
      const body = extractFunctionBody(context.content, "performUpkeep");
      if (!body) return [];
      const extendedBody = `${body}\n${internalCallBodies(context.content, body)}`;
      const revalidates = /(require|revert|UpkeepNotNeeded|checkUpkeep)/.test(extendedBody) &&
        /(block\.timestamp|lastExecutedAt|interval|upkeepNeeded|balance|paused)/.test(extendedBody);
      if (revalidates) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "medium",
          line: firstLineMatching(context.lines, /performUpkeep/),
          title: this.metadata.title,
          description: "Potential issue: anyone can call performUpkeep, so it must independently validate that upkeep is still needed.",
          risk: "Attackers or stale Automation calls may trigger premature or invalid state transitions.",
          recommendation: "Revalidate all critical checkUpkeep conditions inside performUpkeep before changing state.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-AUTO-002",
      product: "automation",
      severity: "medium",
      title: "Potential stale performData trust",
      description: "performUpkeep decodes performData without an obvious freshness or consistency check.",
    },
    scan(context) {
      if (!hasAutomation(context.content)) return [];
      const body = extractFunctionBody(context.content, "performUpkeep");
      if (!/abi\.decode\s*\(\s*performData/.test(body)) return [];
      const validatesPerformData = /(StalePerformData|scheduledAt\s*==|nonce|epoch|deadline|lastExecutedAt|require|revert)/.test(body);
      if (validatesPerformData) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /abi\.decode\s*\(\s*performData/),
          title: this.metadata.title,
          description: "Potential issue: performData generated earlier may be replayed after state conditions change.",
          risk: "Stale performData can execute the wrong task, skip newer state, or trigger duplicate work.",
          recommendation: "Bind performData to current state with a nonce, scheduled timestamp, epoch, or equivalent consistency check.",
        }),
      ];
    },
  },
  {
    metadata: {
      ruleId: "CL-AUTO-003",
      product: "automation",
      severity: "low",
      title: "Potential missing pause or emergency control for upkeep",
      description: "Automation-compatible logic has no obvious pause/emergency path.",
    },
    scan(context) {
      if (!hasAutomation(context.content)) return [];
      if (!/function\s+performUpkeep\b/.test(context.content)) return [];
      const pausePattern =
        /(Pausable|whenNotPaused|paused|unpause|pause\w*\s*\(|emergency|guardian|abort\w*\s*\(|dismantle|kill\w*\s*\(|circuitBreak)/i;
      const hasPause =
        pausePattern.test(context.content) || context.repoSignals.files.some((file) => pausePattern.test(file.content));
      if (hasPause) return [];
      return [
        makeFinding({
          context,
          ruleId: this.metadata.ruleId,
          severity: this.metadata.severity,
          confidence: "low",
          line: firstLineMatching(context.lines, /performUpkeep|checkUpkeep/),
          title: this.metadata.title,
          description: "Potential issue: critical upkeep logic may not have an emergency stop mechanism.",
          risk: "A faulty upkeep or bad offchain configuration may continue changing state until code/configuration is upgraded.",
          recommendation: "Consider pause, guardian, or emergency controls for high-impact upkeep logic and document forwarder assumptions.",
        }),
      ];
    },
  },
];
