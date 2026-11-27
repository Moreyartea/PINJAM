import type { EmailMessage, EmailProvider, EmailSendResult } from "@/lib/email/types";

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    // Safe console logging: Log recipient and subject without leaking sensitive payloads
    console.info(
      `[ConsoleEmailProvider] Email dispatched: to="${message.to}", subject="${message.subject}"`
    );
    return {
      success: true,
      messageId: `console-msg-${Date.now()}`,
    };
  }
}
