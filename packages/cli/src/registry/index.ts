import { ccipSelectors, feeds, registryGeneratedAt, type FeedInfo } from "./data.js";

export type { FeedInfo };
export { registryGeneratedAt };

export function lookupFeed(address: string): FeedInfo | undefined {
  return feeds[address.toLowerCase()];
}

export function lookupCcipSelector(selector: string): string | undefined {
  return ccipSelectors[selector];
}
