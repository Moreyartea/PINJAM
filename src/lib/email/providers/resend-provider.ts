import type { EmailMessage, EmailProvider, EmailSendResult } from "@/lib/email/types";

export interface ResendProviderConfig {
  apiKey: string;
  fromEmail?: string;
  apiUrl?: string;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly apiUrl: string;

  constructor(config: ResendProviderConfig) {
    this.apiKey = config.apiKey.trim();
    this.fromEmail = config.fromEmail?.trim() || "PINJAM <noreply@pinjam.test>";
    this.apiUrl = (config.apiUrl?.trim() || "https://api.resend.com/emails").replace(/\/+$/, "");
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.apiKey) {
      return {
        success: false,
        error: "RESEND_API_KEY is not configured.",
        retryable: false,
      };
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };

      if (message.idempotencyKey) {
        headers["Idempotency-Key"] = message.idempotencyKey;
      }

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: this.fromEmail,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const status = response.status;
        // 429 (Rate Limit) and 5xx (Server Error) are retryable
        const retryable = status === 429 || status >= 500;

        return {
          success: false,
          error: `Resend API error (${status}): ${errorText.slice(0, 300)}`,
          retryable,
        };
      }

      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return {
        success: true,
        messageId: data.id || `resend-${Date.now()}`,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Network error calling Resend API: ${errorMsg}`,
        retryable: true,
      };
    }
  }
}
