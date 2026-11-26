export const ALLOWED_IDENTITY_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// Client-side sanity cap pending final server file limit (Open Decision #7 in API Contract).
export const CLIENT_ADVISORY_MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface KomtingApplicationFormValues {
  fullName: string;
  email: string;
  studentId: string;
  className: string;
  identityPhoto: File | null;
  privacyAccepted: boolean;
}

export interface KomtingApplicationValidationErrors {
  fullName?: string;
  email?: string;
  studentId?: string;
  className?: string;
  identityPhoto?: string;
  privacyAccepted?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateIdentityPhotoFile(file: File | null): string | undefined {
  if (!file) {
    return "Foto identitas wajib diunggah.";
  }

  if (file.size <= 0) {
    return "File foto identitas tidak valid atau kosong.";
  }

  const allowedTypes: readonly string[] = ALLOWED_IDENTITY_PHOTO_MIME_TYPES;
  if (!allowedTypes.includes(file.type)) {
    return "Format foto harus JPG, PNG, atau WebP.";
  }

  if (file.size > CLIENT_ADVISORY_MAX_FILE_BYTES) {
    return "Ukuran file maksimal 5 MB untuk pemeriksaan awal.";
  }

  return undefined;
}

export function validateKomtingApplicationForm(
  values: KomtingApplicationFormValues
): KomtingApplicationValidationErrors {
  const errors: KomtingApplicationValidationErrors = {};

  if (!values.fullName.trim()) {
    errors.fullName = "Nama lengkap wajib diisi.";
  } else if (values.fullName.trim().length < 3) {
    errors.fullName = "Nama lengkap minimal 3 karakter.";
  }

  const email = values.email.trim();
  if (!email) {
    errors.email = "Email wajib diisi.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Format email tidak valid.";
  }

  if (!values.studentId.trim()) {
    errors.studentId = "Nomor identitas mahasiswa (NIM) wajib diisi.";
  }

  if (!values.className.trim()) {
    errors.className = "Nama kelas wajib diisi.";
  }

  const photoError = validateIdentityPhotoFile(values.identityPhoto);
  if (photoError) {
    errors.identityPhoto = photoError;
  }

  if (!values.privacyAccepted) {
    errors.privacyAccepted =
      "Anda harus menyetujui ketentuan penyimpanan privat dokumen identitas.";
  }

  return errors;
}
