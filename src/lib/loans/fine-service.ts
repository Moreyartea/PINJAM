import "server-only";

import { AuthError } from "@/lib/auth/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AccessoriesCondition, ProjectorCondition } from "@/types/domain";

export type FineType = "LATE_RETURN" | "DAMAGE" | "LOSS" | "NONE";
export type FineStatus = "PENDING" | "WAIVED" | "PAID" | "EXEMPT";

export interface LateReturnFineCalculation {
  isOverdue: boolean;
  overdueMinutes: number;
  overdueHours: number;
  fineAmount: number;
  currency: string;
  policy: string;
  calculationDetails: {
    estimated_return_at: string;
    returned_at: string;
    grace_period_minutes: number;
    hourly_rate: number;
    raw_overdue_minutes: number;
  };
}

export interface DamageFineCalculation {
  fineType: FineType;
  assessedFine: number;
  reason: string;
  isDamageOrLoss: boolean;
  details: {
    projector_condition: ProjectorCondition;
    accessories_condition: AccessoriesCondition;
  };
}

export interface LoanFineRecord {
  id: string;
  loan_id: string;
  fine_type: FineType;
  amount: number;
  overdue_minutes: number;
  status: FineStatus;
  calculation_details: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FineCalculationOptions {
  hourlyRate?: number;
  gracePeriodMinutes?: number;
}

/**
 * Calculates late return fine using exact integer-based minutes and hours.
 * Per PRD §7.11 & §7.12: Initial release specifies no automatic monetary fine (default rate = 0).
 */
export function calculateLateReturnFine(
  estimatedReturnAt: string,
  returnedAt: string,
  options: FineCalculationOptions = {}
): LateReturnFineCalculation {
  const estMs = new Date(estimatedReturnAt).getTime();
  const retMs = new Date(returnedAt).getTime();

  if (Number.isNaN(estMs) || Number.isNaN(retMs)) {
    throw new AuthError({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Format tanggal estimasi atau aktual pengembalian tidak valid.",
    });
  }

  const gracePeriodMinutes = Math.max(0, options.gracePeriodMinutes ?? 0);
  const hourlyRate = Math.max(0, options.hourlyRate ?? 0);

  const diffMs = retMs - estMs;
  const rawOverdueMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const isOverdue = rawOverdueMinutes > gracePeriodMinutes;
  const effectiveOverdueMinutes = isOverdue ? rawOverdueMinutes : 0;
  const overdueHours = effectiveOverdueMinutes > 0 ? Math.ceil(effectiveOverdueMinutes / 60) : 0;

  // Use integer arithmetic: hourlyRate in whole currency units (IDR)
  const fineAmount = Math.round(overdueHours * hourlyRate);

  return {
    isOverdue,
    overdueMinutes: effectiveOverdueMinutes,
    overdueHours,
    fineAmount,
    currency: "IDR",
    policy: hourlyRate === 0 ? "PRD_INITIAL_RELEASE_NO_AUTO_FINES" : "CONFIGURED_RATE",
    calculationDetails: {
      estimated_return_at: estimatedReturnAt,
      returned_at: returnedAt,
      grace_period_minutes: gracePeriodMinutes,
      hourly_rate: hourlyRate,
      raw_overdue_minutes: rawOverdueMinutes,
    },
  };
}

/**
 * Evaluates damage and loss status from inspection conditions.
 */
export function calculateDamageFine(
  projectorCondition: ProjectorCondition,
  accessoriesCondition: AccessoriesCondition,
  manualAssessment = 0
): DamageFineCalculation {
  const isDamaged = projectorCondition === "DAMAGED";
  const isIncomplete = accessoriesCondition === "INCOMPLETE";
  const isDamageOrLoss = isDamaged || isIncomplete;

  let fineType: FineType = "NONE";
  let reason = "Unit dan aksesori dalam kondisi normal dan lengkap.";

  if (isDamaged && isIncomplete) {
    fineType = "DAMAGE";
    reason = "Unit proyektor rusak dan kelengkapan aksesori tidak lengkap.";
  } else if (isDamaged) {
    fineType = "DAMAGE";
    reason = "Unit proyektor mengalami kerusakan.";
  } else if (isIncomplete) {
    fineType = "LOSS";
    reason = "Kelengkapan aksesori proyektor tidak lengkap / hilang.";
  }

  const assessedFine = Math.max(0, Math.round(manualAssessment));

  return {
    fineType,
    assessedFine,
    reason,
    isDamageOrLoss,
    details: {
      projector_condition: projectorCondition,
      accessories_condition: accessoriesCondition,
    },
  };
}

export interface FineRepository {
  findFinesByLoanId(loanId: string): Promise<LoanFineRecord[]>;
}

export function createSupabaseFineRepository(): FineRepository {
  const admin = createSupabaseAdminClient();

  return {
    async findFinesByLoanId(loanId: string) {
      const { data, error } = await admin
        .from("loan_fines")
        .select("*")
        .eq("loan_id", loanId)
        .order("created_at", { ascending: true });

      if (error) {
        throw new AuthError({
          status: 500,
          code: "DATABASE_ERROR",
          message: error.message,
        });
      }

      return (data as unknown as LoanFineRecord[]) ?? [];
    },
  };
}
