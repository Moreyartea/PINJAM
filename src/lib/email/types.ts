import type { Json } from "@/lib/supabase/database.types";

export type EmailEventType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "LOAN_STARTED"
  | "LOAN_RETURNED"
  | "KOMTING_APPLICATION_APPROVED"
  | "KOMTING_APPLICATION_REJECTED"
  | "KOMTING_REPLACEMENT_NOTICE_OLD"
  | "KOMTING_REPLACEMENT_COMPLETED"
  | "KOMTING_ASSIGNMENT_DEACTIVATED"
  | (string & {});

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retryable?: boolean;
}

export interface EmailProvider {
  readonly name: string;
  sendEmail(message: EmailMessage): Promise<EmailSendResult>;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface OutboxItem {
  id: string;
  event_type: string;
  recipient: string;
  payload: Json;
  deduplication_key: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
  attempt_count: number;
  next_attempt_at: string;
  locked_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}
