import type { EmailMessage, EmailProvider, EmailSendResult } from "@/lib/email/types";

export interface SimulatedFailure {
  error: string;
  retryable: boolean;
}

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";
  private sentMessages: EmailMessage[] = [];
  private failureQueue: SimulatedFailure[] = [];

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    const plannedFailure = this.failureQueue.shift();
    if (plannedFailure) {
      return {
        success: false,
        error: plannedFailure.error,
        retryable: plannedFailure.retryable,
      };
    }

    // Idempotency: If a message with the identical idempotencyKey has already been sent,
    // return success with the existing message ID without duplicating delivery.
    if (message.idempotencyKey) {
      const existing = this.sentMessages.find((m) => m.idempotencyKey === message.idempotencyKey);
      if (existing) {
        return {
          success: true,
          messageId: `mock-idempotent-${message.idempotencyKey}`,
        };
      }
    }

    this.sentMessages.push({ ...message });
    return {
      success: true,
      messageId: `mock-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  getSentMessages(): EmailMessage[] {
    return [...this.sentMessages];
  }

  simulateFailure(error: string, retryable = true): void {
    this.failureQueue.push({ error, retryable });
  }

  clear(): void {
    this.sentMessages = [];
    this.failureQueue = [];
  }
}
