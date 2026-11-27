import "server-only";

import { AuthError } from "@/lib/auth/errors";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { createSupabaseEvidenceStorage } from "@/lib/storage/evidence-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { AccessoriesCondition, ProjectorCondition, UnitDisposition } from "@/types/domain";

type ReturnInspectionRow = Database["public"]["Tables"]["return_inspections"]["Row"];

export interface InspectionDetailView {
  id: string;
  loan_id: string;
  projector_condition: ProjectorCondition;
  accessories_condition: AccessoriesCondition;
  note: string | null;
  evidence_photo_storage_key: string | null;
  evidence_photo_url: string | null;
  unit_disposition: UnitDisposition;
  inspected_by: string;
  inspected_at: string;
  created_at: string;
}

export interface InspectionRepository {
  findInspectionByLoanId(loanId: string): Promise<ReturnInspectionRow | null>;
}

export function createSupabaseInspectionRepository(): InspectionRepository {
  const admin = createSupabaseAdminClient();

  return {
    async findInspectionByLoanId(loanId: string) {
      const { data, error } = await admin
        .from("return_inspections")
        .select("*")
        .eq("loan_id", loanId)
        .maybeSingle();

      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }

      return data;
    },
  };
}

export async function getStaffInspectionDetail(
  context: AuthenticatedUserContext,
  loanId: string,
  deps: {
    repository?: InspectionRepository;
    storage?: ReturnType<typeof createSupabaseEvidenceStorage>;
  } = {}
): Promise<InspectionDetailView | null> {
  if (context.user.role !== "STAFF" && context.user.role !== "ADMIN") {
    throw new AuthError({
      status: 403,
      code: "FORBIDDEN",
      message: "Hanya STAFF atau ADMIN yang dapat melihat detail inspeksi pengembalian.",
    });
  }

  const repository = deps.repository ?? createSupabaseInspectionRepository();
  const storage = deps.storage ?? createSupabaseEvidenceStorage();

  const inspection = await repository.findInspectionByLoanId(loanId);
  if (!inspection) {
    return null;
  }

  let evidencePhotoUrl: string | null = null;
  if (inspection.evidence_photo_storage_key) {
    evidencePhotoUrl = await storage.createSignedEvidenceUrl(
      inspection.evidence_photo_storage_key,
      3600
    );
  }

  return {
    id: inspection.id,
    loan_id: inspection.loan_id,
    projector_condition: inspection.projector_condition,
    accessories_condition: inspection.accessories_condition,
    note: inspection.note,
    evidence_photo_storage_key: inspection.evidence_photo_storage_key,
    evidence_photo_url: evidencePhotoUrl,
    unit_disposition: inspection.unit_disposition,
    inspected_by: inspection.inspected_by,
    inspected_at: inspection.inspected_at,
    created_at: inspection.created_at,
  };
}
