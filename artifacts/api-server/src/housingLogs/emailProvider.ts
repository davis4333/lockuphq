export type HousingLogEmailPackage = {
  recipients: string[];
  subject: string;
  text: string;
  attachment: {
    filename: string;
    contentType: "application/zip";
    bytes: Buffer;
  };
  idempotencyKey: string;
};

export type HousingLogEmailSendResult = {
  messageId: string;
};

export interface HousingLogEmailProvider {
  sendHousingLogPackage(
    message: HousingLogEmailPackage,
  ): Promise<HousingLogEmailSendResult>;
}

export type HousingLogEmailFailureCategory =
  | "provider_not_configured"
  | "attachment_too_large"
  | "provider_timeout"
  | "provider_network"
  | "provider_rejected"
  | "provider_unexpected_response";

const failureMessages: Record<HousingLogEmailFailureCategory, string> = {
  provider_not_configured:
    "Housing Log email delivery is not configured. Set RESEND_API_KEY and HOUSING_LOG_EMAIL_FROM in Replit Secrets.",
  attachment_too_large:
    "The Housing Log package is too large for the configured email provider.",
  provider_timeout:
    "The email provider timed out before accepting the Housing Log package.",
  provider_network: "The email provider could not be reached. Try again.",
  provider_rejected: "The email provider rejected the Housing Log package.",
  provider_unexpected_response:
    "The email provider returned an unexpected response.",
};

export class HousingLogEmailProviderError extends Error {
  constructor(public readonly category: HousingLogEmailFailureCategory) {
    super(failureMessages[category]);
    this.name = "HousingLogEmailProviderError";
  }
}

type ResendHousingLogEmailProviderOptions = {
  apiKey: string;
  from: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const MAX_RESEND_ENCODED_ATTACHMENT_BYTES = 39 * 1024 * 1024;

export class ResendHousingLogEmailProvider implements HousingLogEmailProvider {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: ResendHousingLogEmailProviderOptions) {
    this.apiKey = options.apiKey;
    this.from = options.from;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async sendHousingLogPackage(
    message: HousingLogEmailPackage,
  ): Promise<HousingLogEmailSendResult> {
    const content = message.attachment.bytes.toString("base64");
    if (
      Buffer.byteLength(content, "ascii") > MAX_RESEND_ENCODED_ATTACHMENT_BYTES
    )
      throw new HousingLogEmailProviderError("attachment_too_large");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetch(RESEND_EMAIL_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.recipients[0]],
          ...(message.recipients.length > 1
            ? { bcc: message.recipients.slice(1) }
            : {}),
          subject: message.subject,
          text: message.text,
          attachments: [
            {
              filename: message.attachment.filename,
              content,
            },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof HousingLogEmailProviderError) throw error;
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw new HousingLogEmailProviderError("provider_timeout");
      throw new HousingLogEmailProviderError("provider_network");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok)
      throw new HousingLogEmailProviderError("provider_rejected");
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new HousingLogEmailProviderError("provider_unexpected_response");
    }
    const messageId =
      typeof body === "object" &&
      body !== null &&
      "id" in body &&
      typeof body.id === "string"
        ? body.id.trim()
        : "";
    if (!messageId)
      throw new HousingLogEmailProviderError("provider_unexpected_response");
    return { messageId };
  }
}

export function createHousingLogEmailProviderFromEnvironment(): HousingLogEmailProvider {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["HOUSING_LOG_EMAIL_FROM"]?.trim();
  if (!apiKey || !from)
    throw new HousingLogEmailProviderError("provider_not_configured");
  return new ResendHousingLogEmailProvider({ apiKey, from });
}
