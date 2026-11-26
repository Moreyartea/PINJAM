import {
  ALLOWED_IDENTITY_PHOTO_MIME_TYPES,
  CLIENT_ADVISORY_MAX_FILE_BYTES,
} from "@/lib/validation/application";
import type { AccessoriesCondition, HandoverActorType, ProjectorCondition } from "@/types/domain";

export interface PickupValidationErrors {
  qrPayload?: string;
  representativeName?: string;
}

export function validatePickupForm(values: {
  qrPayload: string;
  receivedBy: HandoverActorType;
  representativeName: string;
}): PickupValidationErrors {
  const errors: PickupValidationErrors = {};

  if (!values.qrPayload.trim()) {
    errors.qrPayload = "Token QR booking wajib divalidasi terlebih dahulu.";
  }

  if (values.receivedBy === "REPRESENTATIVE" && !values.representativeName.trim()) {
    errors.representativeName = "Nama perwakilan wajib diisi jika bukan diambil komting.";
  }

  return errors;
}

export interface ReturnInspectionValues {
  qrPayload: string;
  returnedBy: HandoverActorType;
  representativeName: string;
  projectorCondition: ProjectorCondition;
  accessoriesCondition: AccessoriesCondition;
  note: string;
  evidencePhoto: File | null;
}

export interface ReturnInspectionValidationErrors {
  qrPayload?: string;
  representativeName?: string;
  evidencePhoto?: string;
}

export function isEvidencePhotoRequired(
  projectorCondition: ProjectorCondition,
  accessoriesCondition: AccessoriesCondition
): boolean {
  return projectorCondition === "DAMAGED" || accessoriesCondition === "INCOMPLETE";
}

export function validateEvidencePhotoFile(
  file: File | null,
  required: boolean
): string | undefined {
  if (!file) {
    return required
      ? "Foto bukti wajib diunggah karena proyektor rusak atau aksesori tidak lengkap."
      : undefined;
  }

  if (file.size <= 0) {
    return "File foto bukti tidak valid atau kosong.";
  }

  const allowed: readonly string[] = ALLOWED_IDENTITY_PHOTO_MIME_TYPES;
  if (!allowed.includes(file.type)) {
    return "Format foto bukti harus JPG, PNG, atau WebP.";
  }

  if (file.size > CLIENT_ADVISORY_MAX_FILE_BYTES) {
    return "Ukuran foto bukti maksimal 5 MB untuk pemeriksaan awal.";
  }

  return undefined;
}

export function validateReturnInspectionForm(
  values: ReturnInspectionValues
): ReturnInspectionValidationErrors {
  const errors: ReturnInspectionValidationErrors = {};

  if (!values.qrPayload.trim()) {
    errors.qrPayload = "Token QR transaksi wajib diisi untuk konfirmasi pengembalian.";
  }

  if (values.returnedBy === "REPRESENTATIVE" && !values.representativeName.trim()) {
    errors.representativeName = "Nama perwakilan pengembali wajib diisi.";
  }

  const photoRequired = isEvidencePhotoRequired(
    values.projectorCondition,
    values.accessoriesCondition
  );
  const photoError = validateEvidencePhotoFile(values.evidencePhoto, photoRequired);
  if (photoError) {
    errors.evidencePhoto = photoError;
  }

  return errors;
}

export interface MaintenanceStartValidationErrors {
  reason?: string;
}

export function validateStartMaintenanceForm(values: {
  reason: string;
}): MaintenanceStartValidationErrors {
  const errors: MaintenanceStartValidationErrors = {};
  if (!values.reason.trim()) {
    errors.reason = "Alasan maintenance wajib diisi.";
  } else if (values.reason.trim().length < 5) {
    errors.reason = "Alasan maintenance minimal 5 karakter.";
  }
  return errors;
}

export interface MaintenanceCompleteValidationErrors {
  resolutionNote?: string;
}

export function validateCompleteMaintenanceForm(values: {
  resolutionNote: string;
}): MaintenanceCompleteValidationErrors {
  const errors: MaintenanceCompleteValidationErrors = {};
  if (!values.resolutionNote.trim()) {
    errors.resolutionNote = "Catatan penyelesaian maintenance wajib diisi.";
  }
  return errors;
}
