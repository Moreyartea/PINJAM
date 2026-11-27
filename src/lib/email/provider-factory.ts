import { ConsoleEmailProvider } from "./providers/console-provider";
import { MockEmailProvider } from "./providers/mock-provider";
import { ResendEmailProvider } from "./providers/resend-provider";
import type { EmailProvider } from "./types";

let singletonMockProvider: MockEmailProvider | null = null;

export function getMockEmailProvider(): MockEmailProvider {
  if (!singletonMockProvider) {
    singletonMockProvider = new MockEmailProvider();
  }
  return singletonMockProvider;
}

export function resetMockEmailProvider(): void {
  if (singletonMockProvider) {
    singletonMockProvider.clear();
  }
}

/**
 * Resolves the appropriate EmailProvider adapter.
 * - If overrideProvider is passed (e.g. in tests/dependency injection), uses it.
 * - If EMAIL_PROVIDER === "mock" or NODE_ENV === "test", uses MockEmailProvider.
 * - If RESEND_API_KEY is present or EMAIL_PROVIDER === "resend", uses ResendEmailProvider.
 * - Otherwise falls back to ConsoleEmailProvider (safe dev logging).
 */
export function getEmailProvider(overrideProvider?: EmailProvider): EmailProvider {
  if (overrideProvider) {
    return overrideProvider;
  }

  const explicitProvider = process.env.EMAIL_PROVIDER?.toLowerCase().trim();

  if (explicitProvider === "mock" || process.env.NODE_ENV === "test") {
    return getMockEmailProvider();
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (explicitProvider === "resend" || (resendApiKey && !explicitProvider)) {
    return new ResendEmailProvider({
      apiKey: resendApiKey || "",
      fromEmail: process.env.EMAIL_FROM,
    });
  }

  return new ConsoleEmailProvider();
}
