// LOCKUPHQ DR Writer — Real Claude API Client
//
// Implements ClaudeJsonClient using the Anthropic Messages API via fetch().
// No SDK dependency — uses Node.js 22+ built-in fetch.
//
// NEVER log ANTHROPIC_API_KEY. NEVER include it in thrown errors.
// Key is read from environment at call time, not module load time.

import type { ClaudeJsonClient, ClaudePromptParts, ClaudeCallMetadata } from './claudeTypes';

// Default model — override with CLAUDE_MODEL env var or createClaudeClient({ model: '...' })
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Default request timeout — override with CLAUDE_TIMEOUT_MS env var. Without this, a hung
// connection to Anthropic would leave the fetch() promise (and everything awaiting it, up to
// the officer's browser) unresolved indefinitely — no error, no way out but a page reload.
const DEFAULT_TIMEOUT_MS = 45000;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ClaudeClientError extends Error {
  readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ClaudeClientError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Internal env helpers — avoid || default pattern when 0 or '' are valid values
// ---------------------------------------------------------------------------

function parseEnvInt(val: string | undefined, fallback: number): number {
  if (val === undefined || val === '') return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

function parseEnvFloat(val: string | undefined, fallback: number): number {
  if (val === undefined || val === '') return fallback;
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

// ---------------------------------------------------------------------------
// Internal Anthropic API shapes
// ---------------------------------------------------------------------------

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  temperature: number;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicApiResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage?: { input_tokens: number; output_tokens: number };
}

interface AnthropicApiError {
  error?: { type?: string; message?: string };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createClaudeClient(metadata?: ClaudeCallMetadata): ClaudeJsonClient {
  return {
    async completeJson(parts: ClaudePromptParts): Promise<string> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new ClaudeClientError(
          'ANTHROPIC_API_KEY is missing. Set it in your local environment before running Step 4C.'
        );
      }

      const model = metadata?.model ?? process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;
      const maxTokens = metadata?.maxTokens ?? parseEnvInt(process.env.CLAUDE_MAX_TOKENS, DEFAULT_MAX_TOKENS);
      const temperature = metadata?.temperature ?? parseEnvFloat(process.env.CLAUDE_TEMPERATURE, DEFAULT_TEMPERATURE);
      const timeoutMs = parseEnvInt(process.env.CLAUDE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

      const body: AnthropicRequest = {
        model,
        max_tokens: maxTokens,
        temperature,
        system: parts.systemPrompt,
        messages: [{ role: 'user', content: parts.userPrompt }],
      };

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new ClaudeClientError(`Claude API request timed out after ${timeoutMs}ms`);
        }
        throw new ClaudeClientError(
          `Network error calling Claude API: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        clearTimeout(timeoutHandle);
      }

      if (!response.ok) {
        let detail = '';
        try {
          const errBody = (await response.json()) as AnthropicApiError;
          if (errBody.error) {
            const t = errBody.error.type ?? '';
            const m = errBody.error.message ?? '';
            detail = ` (${t}: ${m})`.trimEnd();
          }
        } catch {
          // ignore — error body may not be JSON
        }
        throw new ClaudeClientError(
          `Claude API returned HTTP ${response.status}${detail}`,
          response.status
        );
      }

      let data: AnthropicApiResponse;
      try {
        data = (await response.json()) as AnthropicApiResponse;
      } catch (err) {
        throw new ClaudeClientError(
          `Failed to parse Claude API response body: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      const textBlocks = (data.content ?? []).filter(
        (b) => b.type === 'text' && typeof b.text === 'string'
      );
      if (textBlocks.length === 0) {
        throw new ClaudeClientError(
          `Claude API response contained no text content blocks (stop_reason: ${data.stop_reason ?? 'unknown'})`
        );
      }

      return textBlocks.map((b) => b.text ?? '').join('');
    },
  };
}
