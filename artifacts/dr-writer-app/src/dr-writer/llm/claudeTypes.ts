// LOCKUPHQ DR Writer — Claude API shared types
//
// Minimal interface definitions for the Claude API wrapper.
// These types are shared between the real client (Step 4C) and
// the mock client (Step 4B). No SDK dependency required.

export interface ClaudePromptParts {
  systemPrompt: string;
  userPrompt: string;
}

export interface ClaudeJsonClient {
  completeJson(parts: ClaudePromptParts): Promise<string>;
}

export interface ClaudeCallMetadata {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}
