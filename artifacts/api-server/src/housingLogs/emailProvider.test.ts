import assert from "node:assert/strict";
import test from "node:test";
import {
  HousingLogEmailProviderError,
  ResendHousingLogEmailProvider,
} from "./emailProvider";

const message = {
  recipients: ["primary@example.com", "one@example.com", "two@example.com"],
  subject: "Housing Unit Logs — 2026-08-12 — Second Shift",
  text: "Safe package summary",
  attachment: {
    filename: "Housing-Logs_2026-08-12_Shift-2.zip",
    contentType: "application/zip" as const,
    bytes: Buffer.from("zip bytes"),
  },
  idempotencyKey: "attempt-1",
};

test("Resend adapter keeps primary in To, additional recipients private in BCC, and attaches exact bytes", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const provider = new ResendHousingLogEmailProvider({
    apiKey: "secret-api-key",
    from: "LockUpHQ <logs@example.com>",
    fetch: async (input, init) => {
      captured = { url: String(input), init: init! };
      return Response.json({ id: "resend-message-1" });
    },
  });
  assert.deepEqual(await provider.sendHousingLogPackage(message), {
    messageId: "resend-message-1",
  });
  assert.equal(captured?.url, "https://api.resend.com/emails");
  assert.equal(
    new Headers(captured?.init.headers).get("authorization"),
    "Bearer secret-api-key",
  );
  assert.equal(
    new Headers(captured?.init.headers).get("idempotency-key"),
    "attempt-1",
  );
  const body = JSON.parse(String(captured?.init.body));
  assert.deepEqual(body.to, ["primary@example.com"]);
  assert.deepEqual(body.bcc, ["one@example.com", "two@example.com"]);
  assert.equal(body.cc, undefined);
  assert.equal(body.attachments[0].filename, message.attachment.filename);
  assert.equal(
    Buffer.from(body.attachments[0].content, "base64").toString(),
    "zip bytes",
  );
});

test("Resend adapter maps rejection, invalid response, network, and timeout to sanitized errors", async () => {
  const scenarios: Array<{
    category: string;
    fetch: typeof globalThis.fetch;
    timeoutMs?: number;
  }> = [
    {
      category: "provider_rejected",
      fetch: async () =>
        Response.json({ secret: "raw rejection" }, { status: 422 }),
    },
    {
      category: "provider_unexpected_response",
      fetch: async () => Response.json({ unexpected: true }),
    },
    {
      category: "provider_network",
      fetch: async () => {
        throw new Error("sensitive network payload");
      },
    },
    {
      category: "provider_timeout",
      timeoutMs: 1,
      fetch: async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    },
  ];

  for (const scenario of scenarios) {
    const provider = new ResendHousingLogEmailProvider({
      apiKey: "secret",
      from: "logs@example.com",
      fetch: scenario.fetch,
      timeoutMs: scenario.timeoutMs,
    });
    await assert.rejects(
      provider.sendHousingLogPackage(message),
      (error: unknown) =>
        error instanceof HousingLogEmailProviderError &&
        error.category === scenario.category &&
        !error.message.includes("secret") &&
        !error.message.includes("sensitive"),
    );
  }
});

test("Resend adapter rejects an oversized encoded ZIP before contacting the provider", async () => {
  let fetchCalls = 0;
  const provider = new ResendHousingLogEmailProvider({
    apiKey: "secret",
    from: "logs@example.com",
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({ id: "must-not-send" });
    },
  });
  await assert.rejects(
    provider.sendHousingLogPackage({
      ...message,
      attachment: {
        ...message.attachment,
        bytes: Buffer.alloc(30 * 1024 * 1024),
      },
    }),
    (error: unknown) =>
      error instanceof HousingLogEmailProviderError &&
      error.category === "attachment_too_large",
  );
  assert.equal(fetchCalls, 0);
});
