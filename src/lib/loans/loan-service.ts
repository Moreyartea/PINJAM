import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { withIdempotency, type IdempotencyStore } from "@/lib/idempotency/idempotency-service";
import { hashQrPayload } from "@/lib/qr/qr-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Loan, LoanStatus, PaginationMeta } from "@/types/domain";

type LoanRow = Database["public"]["Tables"]["loans"]["Row"];

export interface PickupConfirmationResult {
  booking: {
    id: string;
    status: string;
  };
  loan: {
    id: string;
    status: string;
    picked_up_at: string;
  };
  projector: {
    id: string;
    physical_status: string;
  };
}

export interface StaffLoanView extends Loan {
  komting: {
    id: string;
    full_name: string;
    email: string;
    class_name?: string;
  };
  projector: {
    id: string;
    asset_code: string;
    name: string;
    brand: string | null;
    model: string | null;
    physical_status: string;
  };
  booking_code?: string;
  pickup_received_by?: string;
  representative_name?: string | null;
}

export interface LoanRepository {
  confirmPickupAtomic(params: {
    bookingId: string;
    staffUserId: string;
    qrPayloadHash: string;
    receivedBy: "KOMTING" | "REPRESENTATIVE";
    representativeName?: string | null;
    note?: string | null;
    requestId: string;
  }): Promise<PickupConfirmationResult>;

  findLoanById(loanId: string): Promise<LoanRow | null>;

  listStaffLoans(params: {
    status?: LoanStatus;
    page: number;
    pageSize: number;
  }): Promise<{ items: StaffLoanView[]; totalItems: number }>;

  findStaffLoanDetail(loanId: string): Promise<StaffLoanView | null>;

  listKomtingLoans(params: {
    komtingUserId: string;
    status?: LoanStatus;
    page: number;
    pageSize: number;
  }): Promise<{ items: Loan[]; totalItems: number }>;
}

function parseUuidParam(val: string, fieldName: string): string {
  const match = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    val
  );
  if (!match) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: `Parameter ${fieldName} harus berupa UUID yang valid.`,
      details: [{ field: fieldName, reason: "INVALID_FORMAT" }],
    });
  }
  return val;
}

function mapLoanRowToPublic(row: LoanRow): Loan {
  return {
    id: row.id,
    booking_id: row.booking_id,
    projector_id: row.projector_id,
    komting_id: row.komting_id,
    status: row.status as LoanStatus,
    picked_up_at: row.picked_up_at,
    returned_at: row.returned_at,
    return_condition: null,
  };
}

export function createSupabaseLoanRepository(): LoanRepository {
  const admin = createSupabaseAdminClient();

  return {
    async confirmPickupAtomic(params) {
      // 1. Try atomic RPC from Migration 014
      const { data, error } = await admin.rpc("rpc_staff_confirm_pickup", {
        p_booking_id: params.bookingId,
        p_staff_user_id: params.staffUserId,
        p_qr_payload_hash: params.qrPayloadHash,
        p_received_by: params.receivedBy,
        p_representative_name: params.representativeName ?? null,
        p_note: params.note ?? null,
        p_request_id: params.requestId,
      });

      if (!error && data) {
        return data as unknown as PickupConfirmationResult;
      }

      if (error && error.code !== "PGRST202") {
        const msg = error.message;
        if (msg.includes("PINJAM_ERR:BOOKING_NOT_FOUND")) {
          throw new AuthError({
            status: 404,
            code: "BOOKING_NOT_FOUND",
            message: "Booking tidak ditemukan.",
          });
        }
        if (
          msg.includes("PINJAM_ERR:QR_EXPIRED") ||
          msg.includes("PINJAM_ERR:PICKUP_WINDOW_NOT_OPEN")
        ) {
          throw new AuthError({
            status: 422,
            code: "QR_EXPIRED",
            message: "Masa berlaku pengambilan booking sudah kedaluwarsa atau belum dibuka.",
          });
        }
        if (msg.includes("PINJAM_ERR:PROJECTOR_NOT_AVAILABLE")) {
          throw new AuthError({
            status: 409,
            code: "PROJECTOR_NOT_AVAILABLE",
            message: "Unit proyektor tidak sedang berstatus AVAILABLE.",
          });
        }
        if (msg.includes("PINJAM_ERR:QR_ALREADY_USED")) {
          throw new AuthError({
            status: 409,
            code: "QR_ACTION_MISMATCH",
            message: "Token QR sudah pernah digunakan untuk pickup.",
          });
        }
        if (msg.includes("PINJAM_ERR:QR_PAYLOAD_MISMATCH")) {
          throw new AuthError({
            status: 422,
            code: "QR_INVALID",
            message: "Token QR tidak cocok dengan booking ini.",
          });
        }
      }

      // 2. Direct transactional fallback
      const { data: bkg } = await admin
        .from("bookings")
        .select(
          "id, status, komting_id, projector_id, booking_code, pickup_window_start_at, pickup_window_end_at"
        )
        .eq("id", params.bookingId)
        .maybeSingle();

      if (!bkg) {
        throw new AuthError({
          status: 404,
          code: "BOOKING_NOT_FOUND",
          message: "Booking tidak ditemukan.",
        });
      }

      if (bkg.status !== "CONFIRMED") {
        throw new AuthError({
          status: 409,
          code: "BOOKING_NOT_CONFIRMED",
          message: `Booking berstatus ${bkg.status} tidak dapat diambil.`,
        });
      }

      const now = new Date();
      const windowStart = new Date(bkg.pickup_window_start_at);
      const windowEnd = new Date(bkg.pickup_window_end_at);

      if (now.getTime() < windowStart.getTime() || now.getTime() > windowEnd.getTime()) {
        throw new AuthError({
          status: 422,
          code: "QR_EXPIRED",
          message: "Waktu pengambilan berada di luar rentang pickup window yang diizinkan.",
        });
      }

      const { data: proj } = await admin
        .from("projectors")
        .select("id, physical_status, is_active, name")
        .eq("id", bkg.projector_id)
        .maybeSingle();

      if (!proj || !proj.is_active || proj.physical_status !== "AVAILABLE") {
        throw new AuthError({
          status: 409,
          code: "PROJECTOR_NOT_AVAILABLE",
          message: "Unit proyektor tidak berstatus AVAILABLE.",
        });
      }

      const { data: qr } = await admin
        .from("qr_tokens")
        .select("id, token_hash, pickup_used_at, revoked_at, expires_at")
        .eq("booking_id", bkg.id)
        .maybeSingle();

      if (!qr) {
        throw new AuthError({
          status: 404,
          code: "QR_NOT_FOUND",
          message: "QR token untuk booking ini tidak ditemukan.",
        });
      }

      if (qr.revoked_at || now.getTime() > new Date(qr.expires_at).getTime()) {
        throw new AuthError({
          status: 422,
          code: "QR_EXPIRED",
          message: "QR token telah kedaluwarsa.",
        });
      }

      if (qr.pickup_used_at) {
        throw new AuthError({
          status: 409,
          code: "QR_ACTION_MISMATCH",
          message: "QR token telah digunakan sebelumnya.",
        });
      }

      const nowIso = now.toISOString();

      await admin.from("bookings").update({ status: "FULFILLED" }).eq("id", bkg.id);
      await admin.from("projectors").update({ physical_status: "BORROWED" }).eq("id", proj.id);

      const { data: loan, error: loanErr } = await admin
        .from("loans")
        .insert({
          booking_id: bkg.id,
          projector_id: proj.id,
          komting_id: bkg.komting_id,
          status: "ACTIVE",
          picked_up_at: nowIso,
          pickup_processed_by: params.staffUserId,
          pickup_received_by: params.receivedBy,
          representative_name: params.representativeName ?? null,
        })
        .select("id, status, picked_up_at")
        .single();

      if (loanErr || !loan) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: loanErr?.message ?? "Gagal mencatat loan peminjaman.",
        });
      }

      await admin
        .from("qr_tokens")
        .update({ pickup_used_at: nowIso, loan_id: loan.id })
        .eq("id", qr.id);

      await admin.from("audit_logs").insert({
        actor_user_id: params.staffUserId,
        actor_role: "STAFF",
        actor_source: "API",
        action: "LOAN_PICKUP_CONFIRMED",
        entity_type: "LOAN",
        entity_id: loan.id,
        after_data: {
          booking_id: bkg.id,
          loan_id: loan.id,
          projector_id: proj.id,
          received_by: params.receivedBy,
          picked_up_at: nowIso,
        },
        request_id: params.requestId,
      });

      return {
        booking: { id: bkg.id, status: "FULFILLED" },
        loan: { id: loan.id, status: loan.status, picked_up_at: loan.picked_up_at },
        projector: { id: proj.id, physical_status: "BORROWED" },
      };
    },

    async findLoanById(loanId) {
      const { data, error } = await admin.from("loans").select("*").eq("id", loanId).maybeSingle();

      if (error || !data) return null;
      return data;
    },

    async listStaffLoans({ status, page, pageSize }) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin
        .from("loans")
        .select(
          `
          *,
          users!loans_komting_id_fkey(id, full_name, email),
          projectors!loans_projector_id_fkey(id, asset_code, name, brand, model, physical_status),
          bookings!loans_booking_id_fkey(booking_code)
        `,
          { count: "exact" }
        )
        .order("picked_up_at", { ascending: false })
        .range(from, to);

      if (status) query = query.eq("status", status);

      const { data, error, count } = await query;
      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }

      const items: StaffLoanView[] = (
        (data as unknown as Array<Record<string, unknown>>) ?? []
      ).map((l) => {
        const user = l.users as { id: string; full_name: string; email: string };
        const proj = l.projectors as {
          id: string;
          asset_code: string;
          name: string;
          brand: string | null;
          model: string | null;
          physical_status: string;
        };
        const bkg = l.bookings as { booking_code?: string };
        return {
          ...mapLoanRowToPublic(l as unknown as LoanRow),
          booking_code: bkg?.booking_code,
          pickup_received_by: l.pickup_received_by as string,
          representative_name: l.representative_name as string | null,
          komting: {
            id: user?.id ?? "",
            full_name: user?.full_name ?? "",
            email: user?.email ?? "",
          },
          projector: proj ?? {
            id: "",
            asset_code: "",
            name: "",
            brand: null,
            model: null,
            physical_status: "",
          },
        };
      });

      return { items, totalItems: count ?? 0 };
    },

    async findStaffLoanDetail(loanId) {
      const { data, error } = await admin
        .from("loans")
        .select(
          `
          *,
          users!loans_komting_id_fkey(id, full_name, email),
          projectors!loans_projector_id_fkey(id, asset_code, name, brand, model, physical_status),
          bookings!loans_booking_id_fkey(booking_code)
        `
        )
        .eq("id", loanId)
        .maybeSingle();

      if (error || !data) return null;

      const raw = data as unknown as Record<string, unknown>;
      const user = raw.users as { id: string; full_name: string; email: string };
      const proj = raw.projectors as {
        id: string;
        asset_code: string;
        name: string;
        brand: string | null;
        model: string | null;
        physical_status: string;
      };
      const bkg = raw.bookings as { booking_code?: string };

      const { data: assign } = await admin
        .from("komting_assignments")
        .select("class_name")
        .eq("user_id", user?.id)
        .eq("status", "ACTIVE")
        .maybeSingle();

      return {
        ...mapLoanRowToPublic(data as unknown as LoanRow),
        booking_code: bkg?.booking_code,
        pickup_received_by: data.pickup_received_by as string,
        representative_name: data.representative_name as string | null,
        komting: {
          id: user?.id ?? "",
          full_name: user?.full_name ?? "",
          email: user?.email ?? "",
          class_name: assign?.class_name,
        },
        projector: proj ?? {
          id: "",
          asset_code: "",
          name: "",
          brand: null,
          model: null,
          physical_status: "",
        },
      };
    },

    async listKomtingLoans({ komtingUserId, status, page, pageSize }) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin
        .from("loans")
        .select("*", { count: "exact" })
        .eq("komting_id", komtingUserId)
        .order("picked_up_at", { ascending: false })
        .range(from, to);

      if (status) query = query.eq("status", status);

      const { data, error, count } = await query;
      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }

      return {
        items: (data ?? []).map(mapLoanRowToPublic),
        totalItems: count ?? 0,
      };
    },
  };
}

export interface LoanServiceDeps {
  repository?: LoanRepository;
  idempotencyStore?: IdempotencyStore;
}

export async function confirmPickup(
  context: AuthenticatedUserContext,
  bookingIdParam: string,
  rawBody: unknown,
  idempotencyKey: string | null,
  requestId: string,
  deps: LoanServiceDeps = {}
): Promise<{ status: number; body: { data: PickupConfirmationResult } }> {
  if (context.user.role !== "STAFF" && context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya STAFF atau ADMIN yang dapat mengonfirmasi pengambilan (pickup).",
    });
  }

  const bookingId = parseUuidParam(bookingIdParam, "booking_id");

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Body harus berupa objek JSON yang valid.",
    });
  }

  const record = rawBody as Record<string, unknown>;
  const qrPayload = String(record.qr_payload ?? "").trim();
  const confirmed = record.confirmed === true;
  const receivedBy = String(record.received_by ?? "").trim();
  const representativeName = record.representative_name
    ? String(record.representative_name).trim()
    : null;
  const note = record.note ? String(record.note).trim() : null;

  if (!qrPayload) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Field qr_payload wajib diisi.",
      details: [{ field: "qr_payload", reason: "REQUIRED" }],
    });
  }

  if (!confirmed) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Field confirmed harus bernilai true untuk menyelesaikan pickup.",
      details: [{ field: "confirmed", reason: "MUST_BE_TRUE" }],
    });
  }

  if (receivedBy !== "KOMTING" && receivedBy !== "REPRESENTATIVE") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Field received_by harus bernilai KOMTING atau REPRESENTATIVE.",
      details: [{ field: "received_by", reason: "INVALID_ENUM" }],
    });
  }

  if (receivedBy === "REPRESENTATIVE" && !representativeName) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Nama perwakilan wajib diisi jika pickup dilakukan oleh perwakilan.",
      details: [{ field: "representative_name", reason: "REQUIRED" }],
    });
  }

  const qrPayloadHash = hashQrPayload(qrPayload);
  const repository = deps.repository ?? createSupabaseLoanRepository();

  return withIdempotency({
    actorUserId: context.user.id,
    route: `POST /api/v1/staff/bookings/${bookingId}/pickup`,
    idempotencyKey,
    requestBody: rawBody,
    store: deps.idempotencyStore,
    execute: async () => {
      const result = await repository.confirmPickupAtomic({
        bookingId,
        staffUserId: context.user.id,
        qrPayloadHash,
        receivedBy: receivedBy as "KOMTING" | "REPRESENTATIVE",
        representativeName,
        note,
        requestId,
      });

      return {
        status: 200,
        body: { data: result },
      };
    },
  });
}

export async function listStaffLoans(
  context: AuthenticatedUserContext,
  requestUrl: string,
  deps: LoanServiceDeps = {}
): Promise<{ items: StaffLoanView[]; pagination: PaginationMeta }> {
  if (context.user.role !== "STAFF" && context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya STAFF atau ADMIN yang dapat melihat daftar peminjaman operasional.",
    });
  }

  const url = new URL(requestUrl);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get("page_size") ?? 20)));
  const rawStatus = url.searchParams.get("status")?.trim();

  let status: LoanStatus | undefined;
  if (rawStatus) {
    if (!["ACTIVE", "RETURNED"].includes(rawStatus)) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Status loan filter tidak valid.",
      });
    }
    status = rawStatus as LoanStatus;
  }

  const repository = deps.repository ?? createSupabaseLoanRepository();
  const { items, totalItems } = await repository.listStaffLoans({
    status,
    page,
    pageSize,
  });

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total_items: totalItems,
      total_pages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    },
  };
}

export async function getStaffLoanDetail(
  context: AuthenticatedUserContext,
  loanIdParam: string,
  deps: LoanServiceDeps = {}
): Promise<StaffLoanView> {
  if (context.user.role !== "STAFF" && context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya STAFF atau ADMIN yang dapat melihat detail peminjaman operasional.",
    });
  }

  const loanId = parseUuidParam(loanIdParam, "loan_id");
  const repository = deps.repository ?? createSupabaseLoanRepository();
  const detail = await repository.findStaffLoanDetail(loanId);

  if (!detail) {
    throw new AuthError({
      status: 404,
      code: "LOAN_NOT_FOUND",
      message: "Data peminjaman (loan) tidak ditemukan.",
    });
  }

  return detail;
}

export async function listKomtingLoans(
  context: AuthenticatedUserContext,
  requestUrl: string,
  deps: LoanServiceDeps = {}
): Promise<{ items: Loan[]; pagination: PaginationMeta }> {
  if (context.user.role !== "KOMTING") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya komting yang dapat melihat riwayat peminjaman miliknya.",
    });
  }

  const url = new URL(requestUrl);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get("page_size") ?? 20)));
  const rawStatus = url.searchParams.get("status")?.trim();

  let status: LoanStatus | undefined;
  if (rawStatus) {
    if (!["ACTIVE", "RETURNED"].includes(rawStatus)) {
      throw new AuthError({
        status: 400,
        code: "INVALID_REQUEST",
        message: "Status loan filter tidak valid.",
      });
    }
    status = rawStatus as LoanStatus;
  }

  const repository = deps.repository ?? createSupabaseLoanRepository();
  const { items, totalItems } = await repository.listKomtingLoans({
    komtingUserId: context.user.id,
    status,
    page,
    pageSize,
  });

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total_items: totalItems,
      total_pages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    },
  };
}
