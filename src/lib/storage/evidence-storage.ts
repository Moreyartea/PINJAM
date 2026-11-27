import "server-only";

import { AuthError } from "@/lib/auth/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_EVIDENCE_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MiB upper bound
const ALLOWED_MIME_EXTENSIONS = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function getEvidenceBucketName(): string {
  return process.env.SUPABASE_EVIDENCE_BUCKET?.trim() || "inspection-evidence";
}

function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export interface EvidenceStorageAdapter {
  uploadEvidencePhoto(params: { loanId: string; file: File }): Promise<{ storageKey: string }>;
  createSignedEvidenceUrl(storageKey: string, expiresInSeconds?: number): Promise<string | null>;
  deleteEvidencePhoto(storageKey: string): Promise<void>;
}

export async function validateEvidenceImageFile(file: File): Promise<{
  bytes: Uint8Array;
  contentType: string;
  extension: string;
}> {
  if (file.size <= 0) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "File foto bukti inspeksi tidak boleh kosong.",
      details: [{ field: "evidence_photo", reason: "EMPTY_FILE" }],
    });
  }

  if (file.size > MAX_EVIDENCE_PHOTO_BYTES) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Ukuran foto bukti melebihi batas maksimum 5 MB.",
      details: [{ field: "evidence_photo", reason: "FILE_TOO_LARGE" }],
    });
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detectedMime = detectImageMimeFromBytes(bytes);

  if (!detectedMime || !ALLOWED_MIME_EXTENSIONS.has(detectedMime)) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Format foto bukti harus berupa gambar JPEG, PNG, atau WebP yang valid.",
      details: [{ field: "evidence_photo", reason: "UNSUPPORTED_MEDIA_TYPE" }],
    });
  }

  if (file.type && file.type !== detectedMime && file.type !== "application/octet-stream") {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Header Content-Type file tidak cocok dengan konten biner gambar aktual.",
      details: [{ field: "evidence_photo", reason: "MIME_MISMATCH" }],
    });
  }

  const extension = ALLOWED_MIME_EXTENSIONS.get(detectedMime)!;
  return { bytes, contentType: detectedMime, extension };
}

export function createSupabaseEvidenceStorage(): EvidenceStorageAdapter {
  const admin = createSupabaseAdminClient();
  const bucket = getEvidenceBucketName();

  return {
    async uploadEvidencePhoto({ loanId, file }) {
      const { bytes, contentType, extension } = await validateEvidenceImageFile(file);
      const randomSuffix = crypto.randomUUID();
      const storageKey = `evidence/${loanId}/${randomSuffix}.${extension}`;

      const { error } = await admin.storage
        .from(bucket)
        .upload(storageKey, bytes, { contentType, upsert: false });

      if (error) {
        throw new AuthError({
          status: 500,
          code: "STORAGE_UPLOAD_FAILED",
          message: `Gagal mengunggah foto bukti ke Supabase Storage: ${error.message}`,
        });
      }

      return { storageKey };
    },

    async createSignedEvidenceUrl(storageKey: string, expiresInSeconds = 3600) {
      if (!storageKey || !storageKey.trim()) return null;

      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrl(storageKey.trim(), expiresInSeconds);

      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    },

    async deleteEvidencePhoto(storageKey: string) {
      if (!storageKey || !storageKey.trim()) return;
      await admin.storage.from(bucket).remove([storageKey.trim()]);
    },
  };
}
