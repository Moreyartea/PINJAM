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
