import "server-only";

import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { withIdempotency, type IdempotencyStore } from "@/lib/idempotency/idempotency-service";
import { calculateLateReturnFine } from "@/lib/loans/fine-service";
import { hashQrPayload } from "@/lib/qr/qr-service";
import { createSupabaseEvidenceStorage } from "@/lib/storage/evidence-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type {
  AccessoriesCondition,
  FineStatus,
  FineType,
  HandoverActorType,
  Loan,
  LoanFine,
  LoanStatus,
  ProjectorCondition,
  UnitDisposition,
} from "@/types/domain";

type LoanRow = Database["public"]["Tables"]["loans"]["Row"];
type LoanFineRow = Database["public"]["Tables"]["loan_fines"]["Row"];

export interface ReturnConfirmationResult {
  loan: {
    id: string;
    status: string;
    returned_at: string;
  };
  inspection: {
    id: string;
    projector_condition: string;
    accessories_condition: string;
    unit_disposition: string;
    evidence_photo_storage_key: string | null;
    evidence_photo_url?: string | null;
    inspected_at: string;
  };
  projector: {
    id: string;
    physical_status: string;
  };
  fine: {
    id: string;
    fine_type: string;
    amount: number;
    overdue_minutes: number;
    status: string;
  };
}

export interface ReturnSummaryView {
  loan: {
    id: string;
    status: LoanStatus;
    picked_up_at: string;
    returned_at: string | null;
    return_received_by?: string | null;
    return_representative_name?: string | null;
  };
  booking: {
    id: string;
    booking_code: string;
    booking_date: string;
    start_time: string;
    estimated_return_at: string;
    status: string;
  };
  projector: {
    id: string;
    asset_code: string;
    name: string;
    brand: string | null;
    model: string | null;
    physical_status: string;
  };
  komting: {
    id: string;
    full_name: string;
    email: string;
    class_name: string;
  };
  overdue_preview: {
    is_overdue: boolean;
    overdue_minutes: number;
    overdue_hours: number;
    estimated_return_at: string;
    calculated_at: string;
  };
  qr_status: {
    valid: boolean;
    pickup_used: boolean;
    return_used: boolean;
    is_expired: boolean;
    is_revoked: boolean;
  };
  inspection?: {
    id: string;
    projector_condition: ProjectorCondition;
    accessories_condition: AccessoriesCondition;
    unit_disposition: UnitDisposition;
    evidence_photo_storage_key: string | null;
    evidence_photo_url: string | null;
    note: string | null;
    inspected_at: string;
  } | null;
  fine?: LoanFine | null;
}

export interface KomtingLoanDetailView {
  loan: Loan;
  projector: {
    id: string;
    asset_code: string;
    name: string;
    brand: string | null;
    model: string | null;
  };
  booking: {
    id: string;
    booking_code: string;
    booking_date: string;
    start_time: string;
    estimated_return_at: string;
  };
  inspection?: {
    projector_condition: ProjectorCondition;
    accessories_condition: AccessoriesCondition;
    unit_disposition: UnitDisposition;
    note: string | null;
    inspected_at: string;
  } | null;
  fine?: LoanFine | null;
}

export interface KomtingReturnInitiationResult {
  loan_id: string;
  booking_id: string;
  booking_code: string;
  projector_name: string;
  qr_payload: string;
  qr_token_hash: string;
  expires_at: string;
  instructions: string;
}

export interface ConfirmReturnParams {
  loanId: string;
  staffUserId: string;
  qrPayload?: string | null;
  qrPayloadHash?: string | null;
  returnedBy: HandoverActorType;
  representativeName?: string | null;
  projectorCondition?: ProjectorCondition;
  accessoriesCondition?: AccessoriesCondition;
  unitDisposition?: UnitDisposition;
  note?: string | null;
  evidencePhotoStorageKey?: string | null;
  fineAmount?: number;
  fineNotes?: string | null;
  requestId: string;
}

export interface ReturnRepository {
  confirmReturnAtomic(params: ConfirmReturnParams): Promise<ReturnConfirmationResult>;
  findLoanById(loanId: string): Promise<LoanRow | null>;
  getLoanReturnSummary(loanId: string): Promise<ReturnSummaryView | null>;
  getKomtingLoanDetail(
    loanId: string,
    komtingUserId: string
  ): Promise<KomtingLoanDetailView | null>;
  findQrTokenForLoan(loanId: string): Promise<{
    tokenHash: string;
    expiresAt: string;
    bookingCode: string;
    projectorName: string;
    bookingId: string;
  } | null>;
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

export function createSupabaseReturnRepository(): ReturnRepository {
  const admin = createSupabaseAdminClient();
  const storage = createSupabaseEvidenceStorage();

  return {
    async findLoanById(loanId: string) {
      const { data, error } = await admin.from("loans").select("*").eq("id", loanId).maybeSingle();

      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }

      return data;
    },

    async confirmReturnAtomic(params: ConfirmReturnParams): Promise<ReturnConfirmationResult> {
      // 1. Try atomic RPC from Migration 016
      const { data, error } = await admin.rpc("rpc_staff_confirm_return", {
        p_loan_id: params.loanId,
        p_staff_user_id: params.staffUserId,
        p_qr_payload_hash: params.qrPayloadHash ?? null,
        p_returned_by: params.returnedBy,
        p_representative_name: params.representativeName ?? null,
        p_projector_condition: params.projectorCondition ?? "NORMAL",
        p_accessories_condition: params.accessoriesCondition ?? "COMPLETE",
        p_unit_disposition: params.unitDisposition ?? null,
        p_note: params.note ?? null,
        p_evidence_photo_storage_key: params.evidencePhotoStorageKey ?? null,
        p_fine_amount: params.fineAmount ?? 0,
        p_fine_notes: params.fineNotes ?? null,
        p_request_id: params.requestId,
      });

      if (!error && data) {
        const result = data as unknown as ReturnConfirmationResult;
        if (result.inspection?.evidence_photo_storage_key) {
          result.inspection.evidence_photo_url = await storage.createSignedEvidenceUrl(
            result.inspection.evidence_photo_storage_key,
            3600
          );
        }
        return result;
      }

      if (error && error.code !== "PGRST202") {
        const msg = error.message;
        if (msg.includes("PINJAM_ERR:QR_PAYLOAD_REQUIRED")) {
          throw new AuthError({
            status: 400,
            code: "INVALID_REQUEST",
            message: "Payload token QR wajib disertakan.",
            details: [{ field: "qr_payload", reason: "REQUIRED" }],
          });
        }
        if (msg.includes("PINJAM_ERR:QR_PAYLOAD_MISMATCH")) {
          throw new AuthError({
            status: 422,
            code: "QR_INVALID",
            message: "Payload token QR tidak cocok dengan peminjaman ini.",
          });
        }
        if (msg.includes("PINJAM_ERR:QR_EXPIRED")) {
          throw new AuthError({
            status: 422,
            code: "QR_EXPIRED",
            message: "Token QR telah kedaluwarsa atau dicabut.",
          });
        }
        if (msg.includes("PINJAM_ERR:QR_ACTION_MISMATCH")) {
          throw new AuthError({
            status: 409,
            code: "QR_ACTION_MISMATCH",
            message: "Token QR tidak berlaku untuk tindakan pengembalian.",
          });
        }
        if (msg.includes("PINJAM_ERR:QR_NOT_USED_FOR_PICKUP")) {
          throw new AuthError({
            status: 409,
            code: "QR_ACTION_MISMATCH",
            message: "Token QR belum pernah digunakan untuk pickup.",
          });
        }
        if (msg.includes("PINJAM_ERR:QR_ALREADY_USED")) {
          throw new AuthError({
            status: 409,
            code: "QR_ACTION_MISMATCH",
            message: "Token QR sudah selesai digunakan untuk return.",
          });
        }
        if (msg.includes("PINJAM_ERR:INVALID_DISPOSITION_FOR_DAMAGED_UNIT")) {
          throw new AuthError({
            status: 422,
            code: "INVALID_REQUEST",
            message:
              "Unit proyektor yang rusak atau aksesorinya tidak lengkap tidak dapat dialokasikan sebagai AVAILABLE.",
            details: [{ field: "unit_disposition", reason: "INVALID_DISPOSITION" }],
          });
        }
        if (msg.includes("PINJAM_ERR:MANUAL_FINE_NOT_ALLOWED")) {
          throw new AuthError({
            status: 422,
            code: "INVALID_REQUEST",
            message: "Denda nominal positif hanya diizinkan untuk kerusakan atau kehilangan.",
            details: [{ field: "fine_amount", reason: "MANUAL_FINE_NOT_ALLOWED" }],
          });
        }
        if (msg.includes("PINJAM_ERR:FINE_NOTES_REQUIRED")) {
          throw new AuthError({
            status: 422,
            code: "INVALID_REQUEST",
            message: "Catatan/alasan denda wajib diisi untuk penetapan denda manual.",
            details: [{ field: "fine_notes", reason: "REQUIRED" }],
          });
        }
        if (msg.includes("PINJAM_ERR:FINE_AMOUNT_NEGATIVE")) {
          throw new AuthError({
            status: 400,
            code: "INVALID_REQUEST",
            message: "Nominal denda tidak boleh bernilai negatif.",
            details: [{ field: "fine_amount", reason: "NEGATIVE_AMOUNT" }],
          });
        }
        if (msg.includes("PINJAM_ERR:INSPECTION_ALREADY_EXISTS")) {
          throw new AuthError({
            status: 409,
            code: "INSPECTION_ALREADY_EXISTS",
            message: "Peminjaman ini sudah memiliki catatan inspeksi pengembalian.",
          });
        }
        if (msg.includes("PINJAM_ERR:FINE_ALREADY_EXISTS")) {
          throw new AuthError({
            status: 409,
            code: "FINE_ALREADY_EXISTS",
            message: "Peminjaman ini sudah memiliki catatan denda.",
          });
        }
        if (msg.includes("PINJAM_ERR:REPRESENTATIVE_NAME_REQUIRED")) {
          throw new AuthError({
            status: 422,
            code: "INVALID_REQUEST",
            message: "Nama perwakilan wajib diisi jika pengembalian dilakukan oleh perwakilan.",
            details: [{ field: "representative_name", reason: "REQUIRED" }],
          });
        }
        if (msg.includes("PINJAM_ERR:EVIDENCE_PHOTO_REQUIRED")) {
          throw new AuthError({
            status: 422,
            code: "INVALID_REQUEST",
            message:
              "Foto bukti wajib dilampirkan jika terdapat kerusakan atau ketidaklengkapan aksesori.",
            details: [{ field: "evidence_photo", reason: "REQUIRED" }],
          });
        }
        if (msg.includes("PINJAM_ERR:LOAN_NOT_FOUND")) {
          throw new AuthError({
            status: 404,
            code: "LOAN_NOT_FOUND",
            message: "Data peminjaman (loan) tidak ditemukan.",
          });
        }
        if (msg.includes("PINJAM_ERR:LOAN_NOT_ACTIVE")) {
          throw new AuthError({
            status: 409,
            code: "LOAN_NOT_ACTIVE",
            message: "Peminjaman tidak sedang berstatus ACTIVE.",
          });
        }
        if (msg.includes("PINJAM_ERR:BOOKING_NOT_FOUND")) {
          throw new AuthError({
            status: 404,
            code: "BOOKING_NOT_FOUND",
            message: "Booking terkait peminjaman tidak ditemukan.",
          });
        }
        if (msg.includes("PINJAM_ERR:PROJECTOR_NOT_FOUND")) {
          throw new AuthError({
            status: 404,
            code: "PROJECTOR_NOT_FOUND",
            message: "Proyektor tidak ditemukan.",
          });
        }
        if (msg.includes("PINJAM_ERR:QR_NOT_FOUND")) {
          throw new AuthError({
            status: 404,
            code: "QR_NOT_FOUND",
            message: "Token QR pengembalian tidak ditemukan.",
          });
        }
        if (msg.includes("PINJAM_ERR:FORBIDDEN")) {
          throw new AuthError({
            status: 403,
            code: "FORBIDDEN",
            message: "Pengguna tidak memiliki izin operasional staff aktif.",
          });
        }
        if (msg.includes("PINJAM_ERR:INVALID_REQUEST")) {
          throw new AuthError({
            status: 400,
            code: "INVALID_REQUEST",
            message: "Data permintaan pengembalian tidak valid.",
          });
        }
      }

      // 2. Direct transactional fallback (used in test mocks or if RPC is missing)
      const { data: loan, error: loanErr } = await admin
        .from("loans")
        .select("*")
        .eq("id", params.loanId)
        .maybeSingle();

      if (loanErr || !loan) {
        throw new AuthError({
          status: 404,
          code: "LOAN_NOT_FOUND",
          message: "Data peminjaman (loan) tidak ditemukan.",
        });
      }

      if (loan.status !== "ACTIVE") {
        throw new AuthError({
          status: 409,
          code: "LOAN_NOT_ACTIVE",
          message: "Peminjaman tidak sedang berstatus ACTIVE.",
        });
      }

      const [{ data: booking }, { data: proj }, { data: qr }] = await Promise.all([
        admin.from("bookings").select("*").eq("id", loan.booking_id).maybeSingle(),
        admin.from("projectors").select("*").eq("id", loan.projector_id).maybeSingle(),
        admin.from("qr_tokens").select("*").eq("booking_id", loan.booking_id).maybeSingle(),
      ]);

      if (!booking) {
        throw new AuthError({
          status: 404,
          code: "BOOKING_NOT_FOUND",
          message: "Booking terkait peminjaman tidak ditemukan.",
        });
      }

      if (!proj) {
        throw new AuthError({
          status: 404,
          code: "PROJECTOR_NOT_FOUND",
          message: "Proyektor tidak ditemukan.",
        });
      }

      if (!qr) {
        throw new AuthError({
          status: 404,
          code: "QR_NOT_FOUND",
          message: "Token QR pengembalian tidak ditemukan.",
        });
      }

      if (!params.qrPayloadHash || !params.qrPayloadHash.trim()) {
        throw new AuthError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Payload token QR wajib disertakan.",
          details: [{ field: "qr_payload", reason: "REQUIRED" }],
        });
      }

      if (!qr.token_hash || qr.token_hash !== params.qrPayloadHash.trim()) {
        throw new AuthError({
          status: 422,
          code: "QR_INVALID",
          message: "Payload token QR tidak cocok dengan peminjaman ini.",
        });
      }

      const now = new Date();
      const nowIso = now.toISOString();

      if (qr.revoked_at || !qr.expires_at || new Date(qr.expires_at).getTime() < now.getTime()) {
        throw new AuthError({
          status: 422,
          code: "QR_EXPIRED",
          message: "Token QR telah kedaluwarsa atau dicabut.",
        });
      }

      if (!qr.scope || (qr.scope !== "RETURN" && qr.scope !== "PICKUP_AND_RETURN")) {
        throw new AuthError({
          status: 409,
          code: "QR_ACTION_MISMATCH",
          message: "Token QR tidak berlaku untuk tindakan pengembalian.",
        });
      }

      if (!qr.pickup_used_at) {
        throw new AuthError({
          status: 409,
          code: "QR_ACTION_MISMATCH",
          message: "Token QR belum pernah digunakan untuk pickup.",
        });
      }

      if (qr.return_used_at) {
        throw new AuthError({
          status: 409,
          code: "QR_ACTION_MISMATCH",
          message: "Token QR sudah selesai digunakan untuk return.",
        });
      }

      // Check condition and evidence
      const projCond: ProjectorCondition = params.projectorCondition ?? "NORMAL";
      const accCond: AccessoriesCondition = params.accessoriesCondition ?? "COMPLETE";
      const isDamagedOrIncomplete = projCond === "DAMAGED" || accCond === "INCOMPLETE";

      if (isDamagedOrIncomplete && !params.evidencePhotoStorageKey) {
        throw new AuthError({
          status: 422,
          code: "INVALID_REQUEST",
          message:
            "Foto bukti wajib dilampirkan jika terdapat kerusakan atau ketidaklengkapan aksesori.",
          details: [{ field: "evidence_photo", reason: "REQUIRED" }],
        });
      }

      if (isDamagedOrIncomplete && params.unitDisposition === "AVAILABLE") {
        throw new AuthError({
          status: 422,
          code: "INVALID_REQUEST",
          message:
            "Unit proyektor yang rusak atau aksesorinya tidak lengkap tidak dapat dialokasikan sebagai AVAILABLE.",
          details: [{ field: "unit_disposition", reason: "INVALID_DISPOSITION" }],
        });
      }

      const targetDisposition: UnitDisposition =
        params.unitDisposition ?? (isDamagedOrIncomplete ? "MAINTENANCE" : "AVAILABLE");

      // Calculate overdue fine
      const lateCalc = calculateLateReturnFine(booking.estimated_return_at, nowIso);
      let fineType: FineType = "NONE";
      if (projCond === "DAMAGED") {
        fineType = "DAMAGE";
      } else if (accCond === "INCOMPLETE") {
        fineType = "LOSS";
      } else if (lateCalc.isOverdue) {
        fineType = "LATE_RETURN";
      }

      const fineAmount = params.fineAmount ?? 0;
      if (fineAmount < 0) {
        throw new AuthError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "Nominal denda tidak boleh bernilai negatif.",
          details: [{ field: "fine_amount", reason: "NEGATIVE_AMOUNT" }],
        });
      }

      if (fineAmount > 0) {
        if (fineType !== "DAMAGE" && fineType !== "LOSS") {
          throw new AuthError({
            status: 422,
            code: "INVALID_REQUEST",
            message: "Denda nominal positif hanya diizinkan untuk kerusakan atau kehilangan.",
            details: [{ field: "fine_amount", reason: "MANUAL_FINE_NOT_ALLOWED" }],
          });
        }
        if (!params.fineNotes || !params.fineNotes.trim()) {
          throw new AuthError({
            status: 422,
            code: "INVALID_REQUEST",
            message: "Catatan/alasan denda wajib diisi untuk penetapan denda manual.",
            details: [{ field: "fine_notes", reason: "REQUIRED" }],
          });
        }
      }

      const assessedFine = fineAmount;
      const fineStatus: FineStatus = assessedFine > 0 ? "PENDING" : "EXEMPT";

      // 1. Update loan
      const { data: updatedLoan, error: upLoanErr } = await admin
        .from("loans")
        .update({
          status: "RETURNED",
          returned_at: nowIso,
          return_processed_by: params.staffUserId,
          return_received_by: params.returnedBy,
          return_representative_name: params.representativeName ?? null,
        })
        .eq("id", loan.id)
        .select()
        .single();

      if (upLoanErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal memperbarui data peminjaman: ${upLoanErr.message}`,
        });
      }

      // 2. Update projector
      const { data: updatedProj, error: upProjErr } = await admin
        .from("projectors")
        .update({ physical_status: targetDisposition })
        .eq("id", proj.id)
        .select()
        .single();

      if (upProjErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal memperbarui status proyektor: ${upProjErr.message}`,
        });
      }

      // 3. Mark QR token return_used_at
      await admin.from("qr_tokens").update({ return_used_at: nowIso }).eq("id", qr.id);

      // 4. Insert inspection
      const { data: inspection, error: insErr } = await admin
        .from("return_inspections")
        .insert({
          loan_id: loan.id,
          projector_condition: projCond,
          accessories_condition: accCond,
          unit_disposition: targetDisposition,
          note: params.note ?? null,
          evidence_photo_storage_key: params.evidencePhotoStorageKey ?? null,
          inspected_by: params.staffUserId,
          inspected_at: nowIso,
        })
        .select()
        .single();

      if (insErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal mencatat inspeksi fisik: ${insErr.message}`,
        });
      }

      // 5. If MAINTENANCE, insert maintenance record
      if (targetDisposition === "MAINTENANCE") {
        await admin.from("maintenance_records").insert({
          projector_id: proj.id,
          reason: `Pemeriksaan pengembalian unit ${proj.asset_code}: ${
            projCond === "DAMAGED" ? "Unit rusak. " : ""
          }${accCond === "INCOMPLETE" ? "Aksesori tidak lengkap. " : ""}${params.note ?? ""}`.trim(),
          note: params.note ?? null,
          status: "IN_PROGRESS",
          created_by: params.staffUserId,
          started_at: nowIso,
        });
      }

      // 6. Insert loan_fines
      const { data: fineRec, error: fineErr } = await admin
        .from("loan_fines")
        .insert({
          loan_id: loan.id,
          fine_type: fineType,
          amount: assessedFine,
          overdue_minutes: lateCalc.overdueMinutes,
          status: fineStatus,
          calculation_details: lateCalc.calculationDetails,
          notes: params.fineNotes ?? null,
        } as never)
        .select()
        .single();

      if (fineErr) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: `Gagal mencatat rincian denda: ${fineErr.message}`,
        });
      }

      const fineRow = fineRec as unknown as LoanFineRow;

      // 7. Audit logs (INSERT only)
      await Promise.all([
        admin.from("audit_logs").insert({
          actor_user_id: params.staffUserId,
          actor_role: "STAFF",
          actor_source: "API",
          action: "LOAN_RETURN_CONFIRMED",
          entity_type: "LOAN",
          entity_id: loan.id,
          after_data: {
            loan_id: loan.id,
            returned_at: nowIso,
            returned_by: params.returnedBy,
            unit_disposition: targetDisposition,
          },
          request_id: params.requestId,
        }),
        admin.from("audit_logs").insert({
          actor_user_id: params.staffUserId,
          actor_role: "STAFF",
          actor_source: "API",
          action: "LOAN_INSPECTED",
          entity_type: "RETURN_INSPECTION",
          entity_id: inspection.id,
          after_data: {
            loan_id: loan.id,
            projector_condition: projCond,
            accessories_condition: accCond,
            unit_disposition: targetDisposition,
            has_evidence_photo: Boolean(params.evidencePhotoStorageKey),
          },
          request_id: params.requestId,
        }),
        admin.from("audit_logs").insert({
          actor_user_id: params.staffUserId,
          actor_role: "STAFF",
          actor_source: "API",
          action: "LOAN_FINE_RECORDED",
          entity_type: "LOAN",
          entity_id: loan.id,
          after_data: {
            loan_id: loan.id,
            fine_id: fineRow.id,
            fine_type: fineType,
            amount: assessedFine,
            overdue_minutes: lateCalc.overdueMinutes,
            status: fineStatus,
          },
          request_id: params.requestId,
        }),
      ]);

      // 8. Notification outbox
      const { data: komtingUser } = await admin
        .from("users")
        .select("email")
        .eq("id", loan.komting_id)
        .maybeSingle();

      if (komtingUser?.email) {
        await admin.from("email_outbox").insert({
          event_type: "LOAN_RETURNED",
          recipient: komtingUser.email,
          payload: {
            subject: `Pengembalian Proyektor Berhasil — ${booking.booking_code}`,
            loan_id: loan.id,
            booking_code: booking.booking_code,
            projector_name: proj.name,
            returned_at: nowIso,
            unit_disposition: targetDisposition,
            is_overdue: lateCalc.isOverdue,
            overdue_minutes: lateCalc.overdueMinutes,
          },
          deduplication_key: `loan_returned:${loan.id}`,
        });
      }

      let evidencePhotoUrl: string | null = null;
      if (params.evidencePhotoStorageKey) {
        evidencePhotoUrl = await storage.createSignedEvidenceUrl(
          params.evidencePhotoStorageKey,
          3600
        );
      }

      return {
        loan: {
          id: updatedLoan.id,
          status: updatedLoan.status,
          returned_at: updatedLoan.returned_at ?? nowIso,
        },
        inspection: {
          id: inspection.id,
          projector_condition: inspection.projector_condition,
          accessories_condition: inspection.accessories_condition,
          unit_disposition: inspection.unit_disposition,
          evidence_photo_storage_key: inspection.evidence_photo_storage_key,
          evidence_photo_url: evidencePhotoUrl,
          inspected_at: inspection.inspected_at,
        },
        projector: {
          id: updatedProj.id,
          physical_status: updatedProj.physical_status,
        },
        fine: {
          id: fineRow.id,
          fine_type: fineRow.fine_type,
          amount: Number(fineRow.amount),
          overdue_minutes: fineRow.overdue_minutes,
          status: fineRow.status,
        },
      };
    },

    async getLoanReturnSummary(loanId: string): Promise<ReturnSummaryView | null> {
      const { data: loan, error: loanErr } = await admin
        .from("loans")
        .select("*")
        .eq("id", loanId)
        .maybeSingle();

      if (loanErr || !loan) return null;

      const [
        { data: booking },
        { data: proj },
        { data: user },
        { data: assign },
        { data: qr },
        { data: inspection },
        { data: fine },
      ] = await Promise.all([
        admin.from("bookings").select("*").eq("id", loan.booking_id).maybeSingle(),
        admin.from("projectors").select("*").eq("id", loan.projector_id).maybeSingle(),
        admin.from("users").select("*").eq("id", loan.komting_id).maybeSingle(),
        admin
          .from("komting_assignments")
          .select("class_name")
          .eq("user_id", loan.komting_id)
          .eq("status", "ACTIVE")
          .maybeSingle(),
        admin.from("qr_tokens").select("*").eq("booking_id", loan.booking_id).maybeSingle(),
        admin.from("return_inspections").select("*").eq("loan_id", loan.id).maybeSingle(),
        admin.from("loan_fines").select("*").eq("loan_id", loan.id).maybeSingle(),
      ]);

      if (!booking || !proj || !user) return null;

      const now = new Date();
      const nowIso = now.toISOString();
      const calcReturnAt = loan.returned_at ?? nowIso;
      const lateCalc = calculateLateReturnFine(booking.estimated_return_at, calcReturnAt);

      const qrExpiresAt = qr ? new Date(qr.expires_at).getTime() : 0;
      const isExpired = qr ? now.getTime() > qrExpiresAt : true;
      const isRevoked = Boolean(qr?.revoked_at);

      let evidencePhotoUrl: string | null = null;
      if (inspection?.evidence_photo_storage_key) {
        evidencePhotoUrl = await storage.createSignedEvidenceUrl(
          inspection.evidence_photo_storage_key,
          3600
        );
      }

      const fineRow = fine as unknown as LoanFineRow | null;

      return {
        loan: {
          id: loan.id,
          status: loan.status as LoanStatus,
          picked_up_at: loan.picked_up_at,
          returned_at: loan.returned_at,
          return_received_by: loan.return_received_by,
          return_representative_name: loan.return_representative_name,
        },
        booking: {
          id: booking.id,
          booking_code: booking.booking_code,
          booking_date: booking.booking_date,
          start_time: booking.start_time,
          estimated_return_at: booking.estimated_return_at,
          status: booking.status,
        },
        projector: {
          id: proj.id,
          asset_code: proj.asset_code,
          name: proj.name,
          brand: proj.brand,
          model: proj.model,
          physical_status: proj.physical_status,
        },
        komting: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          class_name: assign?.class_name ?? "Kelas",
        },
        overdue_preview: {
          is_overdue: lateCalc.isOverdue,
          overdue_minutes: lateCalc.overdueMinutes,
          overdue_hours: lateCalc.overdueHours,
          estimated_return_at: booking.estimated_return_at,
          calculated_at: calcReturnAt,
        },
        qr_status: {
          valid: Boolean(qr && !isRevoked && !isExpired && qr.pickup_used_at && !qr.return_used_at),
          pickup_used: Boolean(qr?.pickup_used_at),
          return_used: Boolean(qr?.return_used_at),
          is_expired: isExpired,
          is_revoked: isRevoked,
        },
        inspection: inspection
          ? {
              id: inspection.id,
              projector_condition: inspection.projector_condition,
              accessories_condition: inspection.accessories_condition,
              unit_disposition: inspection.unit_disposition,
              evidence_photo_storage_key: inspection.evidence_photo_storage_key,
              evidence_photo_url: evidencePhotoUrl,
              note: inspection.note,
              inspected_at: inspection.inspected_at,
            }
          : null,
        fine: fineRow
          ? {
              id: fineRow.id,
              loan_id: fineRow.loan_id,
              fine_type: fineRow.fine_type,
              amount: Number(fineRow.amount),
              overdue_minutes: fineRow.overdue_minutes,
              status: fineRow.status,
              calculation_details: fineRow.calculation_details as Record<string, unknown>,
              notes: fineRow.notes,
              created_at: fineRow.created_at,
              updated_at: fineRow.updated_at,
            }
          : null,
      };
    },

    async getKomtingLoanDetail(
      loanId: string,
      komtingUserId: string
    ): Promise<KomtingLoanDetailView | null> {
      const { data: loan, error } = await admin
        .from("loans")
        .select("*")
        .eq("id", loanId)
        .eq("komting_id", komtingUserId)
        .maybeSingle();

      if (error || !loan) return null;

      const [{ data: proj }, { data: bkg }, { data: inspection }, { data: fine }] =
        await Promise.all([
          admin.from("projectors").select("*").eq("id", loan.projector_id).maybeSingle(),
          admin.from("bookings").select("*").eq("id", loan.booking_id).maybeSingle(),
          admin.from("return_inspections").select("*").eq("loan_id", loan.id).maybeSingle(),
          admin.from("loan_fines").select("*").eq("loan_id", loan.id).maybeSingle(),
        ]);

      if (!proj || !bkg) return null;

      const fineRow = fine as unknown as LoanFineRow | null;

      return {
        loan: {
          id: loan.id,
          booking_id: loan.booking_id,
          projector_id: loan.projector_id,
          komting_id: loan.komting_id,
          status: loan.status as LoanStatus,
          picked_up_at: loan.picked_up_at,
          returned_at: loan.returned_at,
          return_condition: inspection?.projector_condition ?? null,
        },
        projector: {
          id: proj.id,
          asset_code: proj.asset_code,
          name: proj.name,
          brand: proj.brand,
          model: proj.model,
        },
        booking: {
          id: bkg.id,
          booking_code: bkg.booking_code,
          booking_date: bkg.booking_date,
          start_time: bkg.start_time,
          estimated_return_at: bkg.estimated_return_at,
        },
        inspection: inspection
          ? {
              projector_condition: inspection.projector_condition,
              accessories_condition: inspection.accessories_condition,
              unit_disposition: inspection.unit_disposition,
              note: inspection.note,
              inspected_at: inspection.inspected_at,
            }
          : null,
        fine: fineRow
          ? {
              id: fineRow.id,
              loan_id: fineRow.loan_id,
              fine_type: fineRow.fine_type,
              amount: Number(fineRow.amount),
              overdue_minutes: fineRow.overdue_minutes,
              status: fineRow.status,
              notes: fineRow.notes,
              created_at: fineRow.created_at,
              updated_at: fineRow.updated_at,
            }
          : null,
      };
    },

    async findQrTokenForLoan(loanId: string) {
      const { data: loan } = await admin
        .from("loans")
        .select("id, booking_id, projector_id")
        .eq("id", loanId)
        .maybeSingle();

      if (!loan) return null;

      const [{ data: qr }, { data: bkg }, { data: proj }] = await Promise.all([
        admin.from("qr_tokens").select("*").eq("booking_id", loan.booking_id).maybeSingle(),
        admin.from("bookings").select("booking_code").eq("id", loan.booking_id).maybeSingle(),
        admin.from("projectors").select("name").eq("id", loan.projector_id).maybeSingle(),
      ]);

      if (!qr || !bkg || !proj) return null;

      return {
        tokenHash: qr.token_hash,
        expiresAt: qr.expires_at,
        bookingCode: bkg.booking_code,
        projectorName: proj.name,
        bookingId: loan.booking_id,
      };
    },
  };
}

export interface ReturnServiceDeps {
  repository?: ReturnRepository;
  idempotencyStore?: IdempotencyStore;
  storage?: ReturnType<typeof createSupabaseEvidenceStorage>;
}

export async function confirmStaffReturn(
  context: AuthenticatedUserContext,
  loanIdParam: string,
  rawBody: unknown,
  idempotencyKey: string | null,
  requestId: string,
  deps: ReturnServiceDeps = {}
): Promise<{ status: number; body: { data: ReturnConfirmationResult } }> {
  if (context.user.role !== "STAFF" && context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya STAFF atau ADMIN yang dapat mengonfirmasi pengembalian proyektor.",
    });
  }

  const loanId = parseUuidParam(loanIdParam, "loan_id");

  if (!rawBody || typeof rawBody !== "object") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Body permintaan harus berupa objek data yang valid.",
    });
  }

  const record = rawBody as Record<string, unknown>;
  const returnedBy = String(record.returned_by ?? "").trim();
  const representativeName = record.representative_name
    ? String(record.representative_name).trim()
    : null;
  const projectorCondition = (record.projector_condition ?? "NORMAL") as ProjectorCondition;
  const accessoriesCondition = (record.accessories_condition ?? "COMPLETE") as AccessoriesCondition;
  const unitDisposition = record.unit_disposition as UnitDisposition | undefined;
  const note = record.note ? String(record.note).trim() : null;
  const qrPayload = record.qr_payload ? String(record.qr_payload).trim() : null;
  let evidencePhotoStorageKey = record.evidence_photo_storage_key
    ? String(record.evidence_photo_storage_key).trim()
    : null;
  const fineAmount = record.fine_amount !== undefined ? Number(record.fine_amount) : 0;
  const fineNotes = record.fine_notes ? String(record.fine_notes).trim() : null;

  if (returnedBy !== "KOMTING" && returnedBy !== "REPRESENTATIVE") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Field returned_by harus bernilai KOMTING atau REPRESENTATIVE.",
      details: [{ field: "returned_by", reason: "INVALID_ENUM" }],
    });
  }

  if (returnedBy === "REPRESENTATIVE" && !representativeName) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Nama perwakilan wajib diisi jika pengembalian dilakukan oleh perwakilan.",
      details: [{ field: "representative_name", reason: "REQUIRED" }],
    });
  }

  if (projectorCondition !== "NORMAL" && projectorCondition !== "DAMAGED") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Kondisi proyektor harus NORMAL atau DAMAGED.",
      details: [{ field: "projector_condition", reason: "INVALID_ENUM" }],
    });
  }

  if (accessoriesCondition !== "COMPLETE" && accessoriesCondition !== "INCOMPLETE") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Kelengkapan aksesori harus COMPLETE atau INCOMPLETE.",
      details: [{ field: "accessories_condition", reason: "INVALID_ENUM" }],
    });
  }

  const isDamagedOrIncomplete =
    projectorCondition === "DAMAGED" || accessoriesCondition === "INCOMPLETE";

  // Handle file upload if evidence_photo is passed as File
  const storage = deps.storage ?? createSupabaseEvidenceStorage();
  if (record.evidence_photo && typeof (record.evidence_photo as File).arrayBuffer === "function") {
    const file = record.evidence_photo as File;
    const { storageKey } = await storage.uploadEvidencePhoto({ loanId, file });
    evidencePhotoStorageKey = storageKey;
  }

  if (isDamagedOrIncomplete && !evidencePhotoStorageKey) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message:
        "Foto bukti wajib dilampirkan jika terdapat kerusakan atau ketidaklengkapan aksesori.",
      details: [{ field: "evidence_photo", reason: "REQUIRED" }],
    });
  }

  if (unitDisposition && unitDisposition !== "AVAILABLE" && unitDisposition !== "MAINTENANCE") {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Status disposisi unit proyektor harus AVAILABLE atau MAINTENANCE.",
      details: [{ field: "unit_disposition", reason: "INVALID_ENUM" }],
    });
  }

  if (isDamagedOrIncomplete && unitDisposition === "AVAILABLE") {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message:
        "Unit proyektor yang rusak atau aksesorinya tidak lengkap tidak dapat dialokasikan sebagai AVAILABLE.",
      details: [{ field: "unit_disposition", reason: "INVALID_DISPOSITION" }],
    });
  }

  if (fineAmount < 0) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Nominal denda tidak boleh bernilai negatif.",
      details: [{ field: "fine_amount", reason: "NEGATIVE_AMOUNT" }],
    });
  }

  if (fineAmount > 0 && !isDamagedOrIncomplete) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Denda nominal positif hanya diizinkan untuk kerusakan atau kehilangan.",
      details: [{ field: "fine_amount", reason: "MANUAL_FINE_NOT_ALLOWED" }],
    });
  }

  if (fineAmount > 0 && !fineNotes) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Catatan/alasan denda wajib diisi untuk penetapan denda manual.",
      details: [{ field: "fine_notes", reason: "REQUIRED" }],
    });
  }

  const qrPayloadHash = qrPayload ? hashQrPayload(qrPayload) : null;
  const repository = deps.repository ?? createSupabaseReturnRepository();

  // Strip non-serializable File objects before idempotency hashing
  const serializablePayload: Record<string, unknown> = {
    ...record,
    evidence_photo: evidencePhotoStorageKey ? "[ATTACHED]" : undefined,
    evidence_photo_storage_key: evidencePhotoStorageKey,
  };

  return withIdempotency({
    actorUserId: context.user.id,
    route: `POST /api/v1/staff/loans/${loanId}/return`,
    idempotencyKey,
    requestBody: serializablePayload,
    store: deps.idempotencyStore,
    execute: async () => {
      const result = await repository.confirmReturnAtomic({
        loanId,
        staffUserId: context.user.id,
        qrPayload,
        qrPayloadHash,
        returnedBy: returnedBy as HandoverActorType,
        representativeName,
        projectorCondition,
        accessoriesCondition,
        unitDisposition,
        note,
        evidencePhotoStorageKey,
        fineAmount,
        fineNotes,
        requestId,
      });

      return {
        status: 200,
        body: { data: result },
      };
    },
  });
}

export async function getStaffLoanReturnSummary(
  context: AuthenticatedUserContext,
  loanIdParam: string,
  deps: ReturnServiceDeps = {}
): Promise<ReturnSummaryView> {
  if (context.user.role !== "STAFF" && context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya STAFF atau ADMIN yang dapat melihat ringkasan pengembalian peminjaman.",
    });
  }

  const loanId = parseUuidParam(loanIdParam, "loan_id");
  const repository = deps.repository ?? createSupabaseReturnRepository();
  const summary = await repository.getLoanReturnSummary(loanId);

  if (!summary) {
    throw new AuthError({
      status: 404,
      code: "LOAN_NOT_FOUND",
      message: "Data peminjaman tidak ditemukan.",
    });
  }

  return summary;
}

export async function getKomtingLoanDetail(
  context: AuthenticatedUserContext,
  loanIdParam: string,
  deps: ReturnServiceDeps = {}
): Promise<KomtingLoanDetailView> {
  if (context.user.role !== "KOMTING") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya komting yang dapat melihat detail peminjaman miliknya.",
    });
  }

  const loanId = parseUuidParam(loanIdParam, "loan_id");
  const repository = deps.repository ?? createSupabaseReturnRepository();
  const detail = await repository.getKomtingLoanDetail(loanId, context.user.id);

  if (!detail) {
    // Check if loan exists for someone else
    const loan = await repository.findLoanById(loanId);
    if (loan && loan.komting_id !== context.user.id) {
      throw new AuthError({
        status: 403,
        code: "FORBIDDEN",
        message: "Anda tidak berhak mengakses data peminjaman milik komting lain.",
      });
    }

    throw new AuthError({
      status: 404,
      code: "LOAN_NOT_FOUND",
      message: "Data peminjaman tidak ditemukan.",
    });
  }

  return detail;
}

export async function initiateKomtingReturn(
  context: AuthenticatedUserContext,
  loanIdParam: string,
  deps: ReturnServiceDeps = {}
): Promise<KomtingReturnInitiationResult> {
  if (context.user.role !== "KOMTING") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya komting yang dapat mengajukan inisiasi pengembalian.",
    });
  }

  const loanId = parseUuidParam(loanIdParam, "loan_id");
  const repository = deps.repository ?? createSupabaseReturnRepository();
  const loan = await repository.findLoanById(loanId);

  if (!loan) {
    throw new AuthError({
      status: 404,
      code: "LOAN_NOT_FOUND",
      message: "Data peminjaman tidak ditemukan.",
    });
  }

  if (loan.komting_id !== context.user.id) {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Anda tidak memiliki hak akses atas peminjaman ini.",
    });
  }

  if (loan.status !== "ACTIVE") {
    throw new AuthError({
      status: 409,
      code: "LOAN_NOT_ACTIVE",
      message: `Peminjaman ini sudah ${loan.status === "RETURNED" ? "selesai dikembalikan" : "tidak aktif"}.`,
    });
  }

  const qrInfo = await repository.findQrTokenForLoan(loanId);
  if (!qrInfo) {
    throw new AuthError({
      status: 404,
      code: "QR_NOT_FOUND",
      message: "Token QR untuk peminjaman ini tidak ditemukan.",
    });
  }

  return {
    loan_id: loan.id,
    booking_id: qrInfo.bookingId,
    booking_code: qrInfo.bookingCode,
    projector_name: qrInfo.projectorName,
    qr_payload: `pinjam://qr/booking/${qrInfo.bookingCode}`,
    qr_token_hash: qrInfo.tokenHash,
    expires_at: qrInfo.expiresAt,
    instructions:
      "Tunjukkan kode QR ini kepada petugas loket untuk proses validasi fisik dan konfirmasi pengembalian proyektor.",
  };
}
