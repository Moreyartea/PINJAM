import "server-only";

import { AuthError } from "@/lib/auth/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_IDENTITY_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MiB conservative upper bound
const ALLOWED_MIME_EXTENSIONS = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function getIdentityBucketName(): string {
  return process.env.SUPABASE_IDENTITY_BUCKET?.trim() || "identity-photos";
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

export interface IdentityStorageAdapter {
  uploadIdentityPhoto(params: { userId: string; file: File }): Promise<{ storageKey: string }>;
  createSignedPhotoUrl(storageKey: string, expiresInSeconds?: number): Promise<string | null>;
  deleteIdentityPhoto(storageKey: string): Promise<void>;
}

export async function validateIdentityImageFile(file: File): Promise<{
  bytes: Uint8Array;
  contentType: string;
  extension: string;
}> {
  if (file.size <= 0) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "File foto identitas tidak boleh kosong.",
      details: [{ field: "identity_photo", reason: "EMPTY_FILE" }],
    });
  }

  if (file.size > MAX_IDENTITY_PHOTO_BYTES) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Ukuran foto identitas melebihi batas maksimum 5 MB.",
      details: [{ field: "identity_photo", reason: "FILE_TOO_LARGE" }],
    });
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detectedMime = detectImageMimeFromBytes(bytes);

  if (!detectedMime || !ALLOWED_MIME_EXTENSIONS.has(detectedMime)) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Format foto identitas harus berupa gambar JPEG, PNG, atau WebP yang valid.",
      details: [{ field: "identity_photo", reason: "UNSUPPORTED_MEDIA_TYPE" }],
    });
  }

  if (
    file.type &&
    file.type !== detectedMime &&
    !(file.type === "image/jpg" && detectedMime === "image/jpeg")
  ) {
    throw new AuthError({
      status: 422,
      code: "INVALID_REQUEST",
      message: "Tipe file foto identitas tidak sesuai dengan isi file.",
      details: [{ field: "identity_photo", reason: "MIME_MISMATCH" }],
    });
  }

  const extension = ALLOWED_MIME_EXTENSIONS.get(detectedMime) ?? "jpg";
  return { bytes, contentType: detectedMime, extension };
}

export function createSupabaseIdentityStorageAdapter(): IdentityStorageAdapter {
  const bucket = getIdentityBucketName();

  return {
    async uploadIdentityPhoto({ userId, file }): Promise<{ storageKey: string }> {
      const validated = await validateIdentityImageFile(file);
      const storageKey = `applications/${userId}/${crypto.randomUUID()}.${validated.extension}`;
      const admin = createSupabaseAdminClient();

      const { error } = await admin.storage.from(bucket).upload(storageKey, validated.bytes, {
        contentType: validated.contentType,
        upsert: false,
      });

      if (error) {
        throw new AuthError({
          status: 500,
          code: "INTERNAL_ERROR",
          message: "Gagal menyimpan foto identitas ke private storage.",
        });
      }

      return { storageKey };
    },

    async createSignedPhotoUrl(storageKey: string, expiresInSeconds = 120): Promise<string | null> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrl(storageKey, expiresInSeconds);

      if (error || !data?.signedUrl) {
        return null;
      }
      return data.signedUrl;
    },

    async deleteIdentityPhoto(storageKey: string): Promise<void> {
      const admin = createSupabaseAdminClient();
      await admin.storage
        .from(bucket)
        .remove([storageKey])
        .catch(() => null);
    },
  };
}
