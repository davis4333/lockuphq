// @workspace/dr-writer — server pipeline entrypoint.
//
// The frozen LOCKUPHQ DR Writer pipeline (Charge 6-1) lives untouched under
// ./charges/6-1 and ./llm. Only import specifiers were adjusted (`.ts`
// extensions stripped) to satisfy this workspace's `moduleResolution: bundler`.
//
// Browser consumers must import types ONLY from "@workspace/dr-writer/types"
// (never from here) so that server/node code (claudeClient) stays out of the
// client bundle.

export { evaluate6_1 } from "./charges/6-1/evaluate6_1";
export { generate6_1, Generate6_1Error } from "./charges/6-1/generate6_1";
export {
  createClaudeClient,
  ClaudeClientError,
  DEFAULT_CLAUDE_MODEL,
} from "./llm/claudeClient";
export type {
  ClaudeJsonClient,
  ClaudeCallMetadata,
  ClaudePromptParts,
} from "./llm/claudeTypes";
export * from "./charges/6-1/types";
