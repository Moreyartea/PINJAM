import crypto from "node:crypto";
import { AuthError } from "@/lib/auth/errors";
import { getQrTokenSecret } from "@/lib/config/server-env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function generateOpaqueQrPayload(): string {
  return `pjmqr_v1_${crypto.randomBytes(24).toString("base64url")}`;
}

/**
 * Deterministically generates an opaque QR token payload using server-only HMAC-SHA256.
 * The output is stable across page reloads and avoids database mutations during GET queries.
 */
export function generateDeterministicQrPayload(
  params: {
    komtingId: string;
    projectorId: string;
    bookingDate: string;
    startTime: string;
    estimatedReturnAt: string;
  },
  secretOverride?: string
): string {
  const secret = secretOverride ?? getQrTokenSecret();
  const cleanStartTime = params.startTime.trim().slice(0, 8); // HH:mm:ss or HH:mm
  const cleanReturn = new Date(params.estimatedReturnAt).toISOString();
  const message = `${params.komtingId}:${params.projectorId}:${params.bookingDate}:${cleanStartTime}:${cleanReturn}`;
  const hmac = crypto.createHmac("sha256", secret).update(message).digest("base64url");
  return `pjmqr_v1_${hmac}`;
}

export function hashQrPayload(payload: string): string {
  const clean = payload.trim();
  return crypto.createHash("sha256").update(clean).digest("hex");
}

export interface QrTokenRepository {
  findTokenByBookingId(bookingId: string): Promise<{
    id: string;
    token_hash: string;
    expires_at: string;
    revoked_at: string | null;
    pickup_used_at: string | null;
  } | null>;

  findCachedPayloadByBookingId?(
    bookingId: string,
    komtingId?: string
  ): Promise<string | null>;

  createTokenForBooking(params: {
    bookingId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;

  updateTokenForBooking?(params: {
    bookingId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;

  findTokenWithDetailsByHash(tokenHash: string): Promise<{
    id: string;
    booking_id: string;
    loan_id: string | null;
    token_hash: string;
    expires_at: string;
    pickup_used_at: string | null;
    return_used_at: string | null;
    revoked_at: string | null;
    booking: {
      id: string;
      booking_code: string;
      status: string;
      komting_id: string;
      projector_id: string;
      pickup_window_start_at: string;
      pickup_window_end_at: string;
    };
    komting: {
      id: string;
      full_name: string;
    };
    projector: {
      id: string;
      name: string;
      physical_status: string;
    };
    className?: string;
  } | null>;
}

export function createSupabaseQrRepository(): QrTokenRepository {
  const admin = createSupabaseAdminClient();

  return {
    async findTokenByBookingId(bookingId: string) {
      const { data, error } = await admin
        .from("qr_tokens")
        .select("id, token_hash, expires_at, revoked_at, pickup_used_at")
        .eq("booking_id", bookingId)
        .maybeSingle();

      if (error || !data) return null;
      return data;
    },

    async findCachedPayloadByBookingId(bookingId: string, komtingId?: string) {
      let query = admin
        .from("idempotency_records")
        .select("response_body")
        .eq("route_or_operation", "POST /api/v1/bookings")
        .contains("response_body", { data: { id: bookingId } });

      if (komtingId) {
        query = query.eq("actor_user_id", komtingId);
      }

      const { data, error } = await query.maybeSingle();
      if (error || !data || !data.response_body) return null;

      const body = data.response_body as Record<string, unknown> | null;
      const dataObj = body?.data as Record<string, unknown> | null;
      const payload = dataObj?.qr_payload;
      if (typeof payload === "string" && payload.trim().length > 0) {
        return payload.trim();
      }
      return null;
    },

    async createTokenForBooking({ bookingId, tokenHash, expiresAt }) {
      const { error } = await admin.from("qr_tokens").insert({
        booking_id: bookingId,
        token_hash: tokenHash,
        scope: "PICKUP_AND_RETURN",
        expires_at: expiresAt,
      });

      if (error) {
        throw new AuthError({
          status: 500,
          code: "QR_CREATION_FAILED",
          message: "Gagal membuat QR token.",
        });
      }
    },

    async updateTokenForBooking({ bookingId, tokenHash, expiresAt }) {
      const { error } = await admin
        .from("qr_tokens")
        .update({ token_hash: tokenHash, expires_at: expiresAt })
        .eq("booking_id", bookingId);

      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }
    },

    async findTokenWithDetailsByHash(tokenHash: string) {
      const { data: qr, error: qrErr } = await admin
        .from("qr_tokens")
        .select(
          "id, booking_id, loan_id, token_hash, expires_at, pickup_used_at, return_used_at, revoked_at"
        )
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (qrErr || !qr) return null;

      const { data: booking, error: bkgErr } = await admin
        .from("bookings")
        .select(
          "id, booking_code, status, komting_id, projector_id, pickup_window_start_at, pickup_window_end_at"
        )
        .eq("id", qr.booking_id)
        .maybeSingle();

      if (bkgErr || !booking) return null;

      const [{ data: user }, { data: proj }, { data: assign }] = await Promise.all([
        admin.from("users").select("id, full_name").eq("id", booking.komting_id).maybeSingle(),
        admin
          .from("projectors")
          .select("id, name, physical_status")
          .eq("id", booking.projector_id)
          .maybeSingle(),
        admin
          .from("komting_assignments")
          .select("class_name")
          .eq("user_id", booking.komting_id)
          .eq("status", "ACTIVE")
          .maybeSingle(),
      ]);

      if (!user || !proj) return null;

      return {
        ...qr,
        booking,
        komting: user,
        projector: proj,
        className: assign?.class_name ?? "Kelas",
      };
    },
  };
}

export async function validateScannedQr(
  params: {
    qrPayload: string;
    action: "PICKUP" | "RETURN";
    requestId: string;
  },
  deps: { repository?: QrTokenRepository } = {}
) {
  const { qrPayload, action } = params;
  if (!qrPayload || typeof qrPayload !== "string" || !qrPayload.trim()) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Field qr_payload wajib diisi.",
      details: [{ field: "qr_payload", reason: "REQUIRED" }],
    });
  }

  if (action !== "PICKUP" && action !== "RETURN") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Action harus berupa PICKUP atau RETURN.",
      details: [{ field: "action", reason: "INVALID_ENUM" }],
    });
  }

  const repository = deps.repository ?? createSupabaseQrRepository();
  const tokenHash = hashQrPayload(qrPayload);
  const tokenDetails = await repository.findTokenWithDetailsByHash(tokenHash);

  if (!tokenDetails) {
    throw new AuthError({
      status: 404,
      code: "QR_NOT_FOUND",
      message: "QR token tidak valid atau tidak ditemukan.",
    });
  }

  const now = Date.now();
  const expiresAtMs = new Date(tokenDetails.expires_at).getTime();

  if (tokenDetails.revoked_at || now > expiresAtMs) {
    throw new AuthError({
      status: 422,
      code: "QR_EXPIRED",
      message: "Token QR telah kedaluwarsa atau dicabut.",
    });
  }

  if (action === "PICKUP") {
    if (tokenDetails.pickup_used_at) {
      throw new AuthError({
        status: 409,
        code: "QR_ACTION_MISMATCH",
        message: "Token QR telah digunakan untuk pickup sebelumnya.",
      });
    }

    if (tokenDetails.booking.status !== "CONFIRMED") {
      throw new AuthError({
        status: 409,
        code: "BOOKING_NOT_CONFIRMED",
        message: `Status booking (${tokenDetails.booking.status}) tidak memenuhi syarat pickup.`,
      });
    }
  } else {
    // RETURN
    if (!tokenDetails.pickup_used_at) {
      throw new AuthError({
        status: 409,
        code: "QR_ACTION_MISMATCH",
        message: "Unit belum pernah diambil (pickup belum tercatat).",
      });
    }

    if (tokenDetails.return_used_at) {
      throw new AuthError({
        status: 409,
        code: "QR_ACTION_MISMATCH",
        message: "Token QR sudah selesai digunakan untuk return.",
      });
    }
  }

  return {
    valid: true,
    action,
    transaction: {
      booking_id: tokenDetails.booking.id,
      booking_code: tokenDetails.booking.booking_code,
      komting_name: tokenDetails.komting.full_name,
      class_name: tokenDetails.className ?? "Kelas",
      projector_name: tokenDetails.projector.name,
      status: tokenDetails.booking.status,
    },
    requires_confirmation: true,
  };
}
