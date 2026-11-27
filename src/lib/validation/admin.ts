import type { KomtingApplication } from "@/types/domain";

const APPROVABLE_NEW_STATUSES = new Set(["PENDING_VERIFICATION", "PENDING_REVIEW"]);
const REPLACEMENT_ELIGIBLE_STATUSES = new Set([
  "PENDING_VERIFICATION",
  "PENDING_REVIEW",
  "PENDING_REPLACEMENT_NOTICE",
]);

export function isReplacementApplication(
  application: Pick<KomtingApplication, "application_type" | "status">
): boolean {
  return (
    application.application_type === "REPLACEMENT" ||
    application.status === "PENDING_REPLACEMENT_NOTICE"
  );
}

export function canApproveNewApplication(
  application: Pick<KomtingApplication, "application_type" | "status">
): boolean {
  return APPROVABLE_NEW_STATUSES.has(application.status) && !isReplacementApplication(application);
}

export function canApproveReplacementApplication(
  application: Pick<KomtingApplication, "application_type" | "status">
): boolean {
  return (
    REPLACEMENT_ELIGIBLE_STATUSES.has(application.status) && isReplacementApplication(application)
  );
}

export function canRejectApplication(application: Pick<KomtingApplication, "status">): boolean {
  return REPLACEMENT_ELIGIBLE_STATUSES.has(application.status);
}

export interface RejectApplicationValidationErrors {
  reason?: string;
}

export function validateRejectApplicationForm(values: {
  reason: string;
}): RejectApplicationValidationErrors {
  const errors: RejectApplicationValidationErrors = {};
  if (!values.reason.trim()) {
    errors.reason = "Alasan penolakan wajib diisi.";
  } else if (values.reason.trim().length < 5) {
    errors.reason = "Alasan penolakan minimal 5 karakter.";
  }
  return errors;
}

export interface CreateProjectorValidationErrors {
  assetCode?: string;
  name?: string;
}

export function validateCreateProjectorForm(values: {
  assetCode: string;
  name: string;
}): CreateProjectorValidationErrors {
  const errors: CreateProjectorValidationErrors = {};
  if (!values.assetCode.trim()) {
    errors.assetCode = "Kode aset proyektor wajib diisi.";
  }
  if (!values.name.trim()) {
    errors.name = "Nama proyektor wajib diisi.";
  }
  return errors;
}

export interface UpdateProjectorValidationErrors {
  name?: string;
}

export function validateUpdateProjectorForm(values: {
  name: string;
}): UpdateProjectorValidationErrors {
  const errors: UpdateProjectorValidationErrors = {};
  if (!values.name.trim()) {
    errors.name = "Nama proyektor wajib diisi.";
  }
  return errors;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function normalizeApiTime(value: string): string {
  const trimmed = value.trim();
  const match = TIME_PATTERN.exec(trimmed);
  if (!match) return trimmed;
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

export function toTimeMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface OperatingHoursValidationErrors {
  date?: string;
  opensAt?: string;
  closesAt?: string;
  adminEarlyOpenAt?: string;
}

export function validateOperatingHoursForm(values: {
  date: string;
  opensAt: string;
  closesAt: string;
  adminEarlyOpenAt: string;
}): OperatingHoursValidationErrors {
  const errors: OperatingHoursValidationErrors = {};

  if (!DATE_PATTERN.test(values.date.trim())) {
    errors.date = "Tanggal layanan harus berformat YYYY-MM-DD.";
  }

  const opensMin = toTimeMinutes(values.opensAt);
  if (opensMin === null) {
    errors.opensAt = "Jam buka wajib diisi dengan format HH:mm.";
  }

  const closesMin = toTimeMinutes(values.closesAt);
  if (closesMin === null) {
    errors.closesAt = "Jam tutup wajib diisi dengan format HH:mm.";
  } else if (opensMin !== null && closesMin <= opensMin) {
    errors.closesAt = "Jam tutup harus lebih akhir dari jam buka.";
  }

  if (values.adminEarlyOpenAt.trim()) {
    const earlyMin = toTimeMinutes(values.adminEarlyOpenAt);
    if (earlyMin === null) {
      errors.adminEarlyOpenAt = "Jam pembukaan lebih awal harus berformat HH:mm.";
    } else if (opensMin !== null && earlyMin > opensMin) {
      errors.adminEarlyOpenAt = "Pembukaan lebih awal tidak boleh melampaui jam buka layanan.";
    }
  }

  return errors;
}

export interface DeactivateAssignmentValidationErrors {
  assignmentId?: string;
  reason?: string;
}

export function validateDeactivateAssignmentForm(values: {
  assignmentId: string;
  reason: string;
}): DeactivateAssignmentValidationErrors {
  const errors: DeactivateAssignmentValidationErrors = {};
  if (!values.assignmentId.trim()) {
    errors.assignmentId = "ID assignment komting wajib diisi.";
  }
  if (!values.reason.trim()) {
    errors.reason = "Alasan penonaktifan wajib diisi.";
  } else if (values.reason.trim().length < 5) {
    errors.reason = "Alasan penonaktifan minimal 5 karakter.";
  }
  return errors;
}

export interface UpdateMeValidationErrors {
  fullName?: string;
}

export function validateUpdateMeForm(values: { fullName: string }): UpdateMeValidationErrors {
  const errors: UpdateMeValidationErrors = {};
  if (!values.fullName.trim()) {
    errors.fullName = "Nama lengkap wajib diisi.";
  } else if (values.fullName.trim().length < 2) {
    errors.fullName = "Nama lengkap minimal 2 karakter.";
  }
  return errors;
}
