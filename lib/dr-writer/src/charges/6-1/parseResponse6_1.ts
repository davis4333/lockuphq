// LOCKUPHQ DR Writer — Charge 6-1 Response Parser
// Validates and parses a raw Claude API response string into OutputSchema6_1.
//
// This module does NOT call the Claude API.
// Pass the raw response text from Claude; this validates and returns a typed object.
//
// TODO: full field-level validation against output_schema_v1_1.json
// TODO: handle streaming / partial responses
// TODO: validate cleaned_facts field shapes against CleanedFacts6_1

import type { OutputSchema6_1 } from './types';

export class ParseError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'ParseError';
    this.raw = raw;
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  let jsonText: string;

  if (trimmed.startsWith('```json') && trimmed.endsWith('```')) {
    // Strip ```json ... ``` fence — entire response must be the fence (no prose outside)
    jsonText = trimmed.slice('```json'.length, -3).trim();
  } else if (trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.length > 6) {
    // Strip ``` ... ``` fence — entire response must be the fence (no prose outside)
    jsonText = trimmed.slice(3, -3).trim();
  } else if (trimmed.startsWith('{')) {
    // Clean JSON — no fence
    jsonText = trimmed;
  } else {
    throw new ParseError(
      'Response must start with "{" or be a ```json or ``` code fence wrapping JSON only. Prose outside the fence is not accepted.',
      raw
    );
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new ParseError('Claude response is not valid JSON', raw);
  }
}

function isValidStatus(value: unknown): value is 'RED' | 'YELLOW' | 'GREEN' {
  return value === 'RED' || value === 'YELLOW' || value === 'GREEN';
}

function assertOutputShape(data: unknown, raw: string): asserts data is OutputSchema6_1 {
  if (typeof data !== 'object' || data === null) {
    throw new ParseError('Response is not a JSON object', raw);
  }

  const d = data as Record<string, unknown>;

  if (d['schema_version'] !== '1.1') {
    throw new ParseError(
      `Invalid schema_version: expected "1.1", got ${JSON.stringify(d['schema_version'])}`,
      raw
    );
  }

  if (d['charge'] !== '6-1') {
    throw new ParseError(
      `Invalid charge: expected "6-1", got ${JSON.stringify(d['charge'])}`,
      raw
    );
  }

  if (!isValidStatus(d['status'])) {
    throw new ParseError(
      `Invalid status: expected "RED", "YELLOW", or "GREEN", got ${JSON.stringify(d['status'])}`,
      raw
    );
  }

  // RED responses should never be generated — narrative must be null
  if (d['status'] === 'RED' && d['narrative'] !== null && d['narrative'] !== undefined) {
    throw new ParseError(
      'Invalid response: status is RED but narrative is not null. RED cases must not produce a narrative.',
      raw
    );
  }

  if (!Array.isArray(d['red_blockers'])) {
    throw new ParseError('red_blockers must be an array', raw);
  }

  if (!Array.isArray(d['yellow_warnings'])) {
    throw new ParseError('yellow_warnings must be an array', raw);
  }

  if (!Array.isArray(d['officer_review_checklist'])) {
    throw new ParseError('officer_review_checklist must be an array', raw);
  }

  // TODO: validate cleaned_facts shape (all required CleanedFacts6_1 fields present)
  // TODO: validate narrative is a non-empty string for GREEN/YELLOW
  // TODO: validate flagged_sections is [] or [1] (boolean-style marker, not a paragraph index)
  // TODO: validate ai_disclosure is a non-empty string
  // TODO: validate yellow_warnings entries have required fields
}

export function parseResponse6_1(raw: string): OutputSchema6_1 {
  const data = extractJson(raw);
  assertOutputShape(data, raw);
  return data;
}
