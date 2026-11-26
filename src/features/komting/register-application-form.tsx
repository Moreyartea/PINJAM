"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Alert } from "@/components/feedback/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { normalizeUnknownError } from "@/lib/api/errors";
import { formatJakartaDateTime } from "@/lib/utils/date";
import {
  validateIdentityPhotoFile,
  validateKomtingApplicationForm,
  type KomtingApplicationValidationErrors,
} from "@/lib/validation/application";
import { isMockMode, services } from "@/services";

interface SubmissionSuccess {
  application_id: string;
  status: string;
  submitted_at: string;
}

export function RegisterApplicationForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [className, setClassName] = useState("");
  const [identityPhoto, setIdentityPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<KomtingApplicationValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmissionSuccess | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!file) {
      setIdentityPhoto(null);
      return;
    }

    const fileError = validateIdentityPhotoFile(file);
    if (fileError) {
      setIdentityPhoto(null);
      setFieldErrors((prev) => ({ ...prev, identityPhoto: fileError }));
      return;
    }

    setIdentityPhoto(file);
    setFieldErrors((prev) => ({ ...prev, identityPhoto: undefined }));
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const errors = validateKomtingApplicationForm({
      fullName,
      email,
      studentId,
      className,
      identityPhoto,
      privacyAccepted,
    });
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0 || !identityPhoto) {
      return;
    }

    const formData = new FormData();
    formData.append("full_name", fullName.trim());
    formData.append("email", email.trim());
    formData.append("student_id", studentId.trim());
    formData.append("class_name", className.trim());
    formData.append("identity_photo", identityPhoto);

    setIsSubmitting(true);
    try {
      const response = await services.application.submitApplication(formData);
      setSubmitted(response.data);
    } catch (err) {
      const normalized = normalizeUnknownError(err);
      const apiFieldErrors = normalized.getFieldErrors();
      if (Object.keys(apiFieldErrors).length > 0) {
        setFieldErrors((prev) => ({
          ...prev,
          fullName: apiFieldErrors.full_name ?? prev.fullName,
          email: apiFieldErrors.email ?? prev.email,
          studentId: apiFieldErrors.student_id ?? prev.studentId,
          className: apiFieldErrors.class_name ?? prev.className,
          identityPhoto: apiFieldErrors.identity_photo ?? prev.identityPhoto,
        }));
      }
      setSubmitError(normalized.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-xl">
        <Card tone="success">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <Badge tone="primary">Pengajuan Terkirim</Badge>
              <StatusBadge status={submitted.status} />
            </div>
            <CardTitle className="mt-3 text-xl">Pengajuan Komting Diterima</CardTitle>
            <CardDescription>
              Pengajuan tidak langsung mengaktifkan akun komting. ADMIN akan meninjau data Anda
              setelah verifikasi email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="p-3 bg-[var(--color-surface)] nb-border rounded-[var(--radius-sm)] space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)] font-semibold">ID Pengajuan</span>
                <span className="font-mono font-bold">{submitted.application_id}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)] font-semibold">Waktu Kirim</span>
                <span>{formatJakartaDateTime(submitted.submitted_at)}</span>
              </div>
            </div>

            {submitted.status === "PENDING_REPLACEMENT_NOTICE" && (
              <Alert tone="warning" title="Terdeteksi Sebagai Pengajuan Pergantian">
                Kelas yang Anda ajukan saat ini sudah memiliki komting aktif. Pengajuan diproses
                sebagai permintaan pergantian dan menunggu keputusan ADMIN.
              </Alert>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Link href="/application/status">
              <Button variant="primary" size="sm">
                Lihat Status Pengajuan
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm">
                Ke Halaman Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Badge tone="primary">Pendaftaran Komting</Badge>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
          </div>
          <CardTitle className="mt-3 text-xl sm:text-2xl">Ajukan Pendaftaran Komting</CardTitle>
          <CardDescription>
            Hanya mahasiswa yang mengajukan diri sebagai komting kelas yang dapat mendaftar. Satu
            kelas hanya memiliki satu komting aktif.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            <Alert tone="info" title="Catatan Akun &amp; Keamanan Dokumen">
              Foto identitas disimpan pada storage privat dan hanya dapat diakses ADMIN berwenang
              untuk verifikasi (tanpa face recognition). Pengaturan password mengikuti provider
              autentikasi final (Open Decision).
            </Alert>

            {submitError && (
              <Alert tone="danger" title="Pengajuan Gagal">
                {submitError}
              </Alert>
            )}

            <Input
              id="reg-full-name"
              name="full_name"
              label="Nama Lengkap"
              placeholder="Contoh: Budi Santoso"
              required
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (fieldErrors.fullName)
                  setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
              error={fieldErrors.fullName}
              disabled={isSubmitting}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="reg-student-id"
                name="student_id"
                label="Nomor Identitas Mahasiswa (NIM)"
                placeholder="Contoh: 240101001"
                required
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  if (fieldErrors.studentId)
                    setFieldErrors((prev) => ({ ...prev, studentId: undefined }));
                }}
                error={fieldErrors.studentId}
                disabled={isSubmitting}
              />

              <Input
                id="reg-class-name"
                name="class_name"
                label="Kelas"
                placeholder="Contoh: IF-01"
                required
                value={className}
                onChange={(e) => {
                  setClassName(e.target.value);
                  if (fieldErrors.className)
                    setFieldErrors((prev) => ({ ...prev, className: undefined }));
                }}
                hint="Jika kelas sudah punya komting aktif, pengajuan otomatis menjadi pergantian."
                error={fieldErrors.className}
                disabled={isSubmitting}
              />
            </div>

            <Input
              id="reg-email"
              name="email"
              type="email"
              autoComplete="email"
              label="Email Aktif"
              placeholder="nama@kampus.ac.id"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              error={fieldErrors.email}
              disabled={isSubmitting}
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="reg-identity-photo"
                className="text-sm font-bold text-[var(--color-ink)] inline-flex items-center gap-1"
              >
                <span>Foto Identitas (KTM / Kartu Mahasiswa)</span>
                <span aria-hidden="true" className="text-[#b91c1c]">
                  *
                </span>
              </label>

              <input
                id="reg-identity-photo"
                name="identity_photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={isSubmitting}
                aria-invalid={fieldErrors.identityPhoto ? true : undefined}
                aria-describedby={
                  fieldErrors.identityPhoto ? "reg-identity-photo-error" : "reg-identity-photo-hint"
                }
                className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-[var(--radius-sm)] file:border-2 file:border-[var(--border-color)] file:bg-[var(--color-secondary)] file:font-bold file:text-[var(--color-ink)] hover:file:bg-[var(--color-secondary-hover)] nb-border rounded-[var(--radius-sm)] p-1.5 bg-[var(--color-surface)] cursor-pointer"
              />

              <p id="reg-identity-photo-hint" className="text-xs text-[var(--color-muted)]">
                Format JPG, PNG, atau WebP (maks. 5 MB pemeriksaan awal; disimpan privat).
              </p>

              {fieldErrors.identityPhoto && (
                <p
                  id="reg-identity-photo-error"
                  role="alert"
                  className="text-xs font-semibold text-[#991b1b]"
                >
                  {fieldErrors.identityPhoto}
                </p>
              )}

              {previewUrl && (
                <div className="mt-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
                  <p className="text-xs font-bold mb-2">Pratinjau Foto Identitas (Lokal)</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Pratinjau foto identitas pendaftar"
                    className="max-h-48 w-auto rounded-[var(--radius-sm)] nb-border object-contain bg-[var(--color-surface)]"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input
                  id="reg-privacy"
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(e) => {
                    setPrivacyAccepted(e.target.checked);
                    if (fieldErrors.privacyAccepted) {
                      setFieldErrors((prev) => ({ ...prev, privacyAccepted: undefined }));
                    }
                  }}
                  disabled={isSubmitting}
                  className="mt-1 h-4 w-4 accent-[var(--color-ink)]"
                />
                <span>
                  Saya menyetujui bahwa foto identitas disimpan secara privat untuk keperluan
                  verifikasi ADMIN dan tidak dibagikan ke publik.
                </span>
              </label>
              {fieldErrors.privacyAccepted && (
                <p role="alert" className="text-xs font-semibold text-[#991b1b]">
                  {fieldErrors.privacyAccepted}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isSubmitting}
              loadingText="Mengunggah & mengirim pengajuan..."
            >
              Kirim Pengajuan Komting
            </Button>
          </CardContent>
        </form>

        <CardFooter className="justify-between text-sm">
          <span className="text-[var(--color-muted)]">Sudah memiliki akun?</span>
          <Link href="/login" className="font-bold underline underline-offset-4">
            Login di sini
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
