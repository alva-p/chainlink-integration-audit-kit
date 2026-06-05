import type { Rule } from "../types.js";
import { automationRules } from "./automation.js";
import { ccipRules } from "./ccip.js";
import { dataFeedRules } from "./data-feeds.js";
import { functionsCreRules } from "./functions-cre.js";
import { vrfRules } from "./vrf.js";

export const rules: Rule[] = [
  ...dataFeedRules,
  ...ccipRules,
  ...vrfRules,
  ...automationRules,
  ...functionsCreRules,
];
