import type { Rule } from "../types.js";
import { automationRules } from "./automation.js";
import { ccipRules } from "./ccip.js";
import { dataFeedRules } from "./data-feeds.js";
import { dataStreamsRules } from "./data-streams.js";
import { functionsCreRules } from "./functions-cre.js";
import { registryRules } from "./registry-checks.js";
import { vrfRules } from "./vrf.js";

export const rules: Rule[] = [
  ...dataFeedRules,
  ...registryRules,
  ...dataStreamsRules,
  ...ccipRules,
  ...vrfRules,
  ...automationRules,
  ...functionsCreRules,
];
