"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { normalizeUnknownError } from "@/lib/api/errors";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { createIdempotencyKey } from "@/lib/utils/idempotency";
import {
  isEvidencePhotoRequired,
  validateEvidencePhotoFile,
  validateReturnInspectionForm,
  type ReturnInspectionValidationErrors,
} from "@/lib/validation/staff";
import { services } from "@/services";
import type {
  AccessoriesCondition,
  HandoverActorType,
  Loan,
  ProjectorCondition,
} from "@/types/domain";

export interface ReturnInspectionResult {
  loan: { id: string; status: string; returned_at: string | null };
  inspection: {
    projector_condition: string;
    accessories_condition: string;
    unit_disposition: string;
  };
  projector: { id: string; physical_status: string };
}

export interface ReturnInspectionFormProps {
  loan: Loan;
  projectorLabel?: string;
  initialQrPayload?: string;
  onCompleted?: (result: ReturnInspectionResult) => void;
}

/**
 * Shared Return Inspection form for STAFF/ADMIN.
 * Dynamically requires evidence photo when DAMAGED or INCOMPLETE.
 * Never imposes automatic fines or academic sanctions.
 */
export function ReturnInspectionForm({
  loan,
  projectorLabel,
  initialQrPayload = "",
  onCompleted,
}: ReturnInspectionFormProps) {
  const [qrPayload, setQrPayload] = useState(initialQrPayload);
  const [returnedBy, setReturnedBy] = useState<HandoverActorType>("KOMTING");
  const [representativeName, setRepresentativeName] = useState("");
  const [projectorCondition, setProjectorCondition] = useState<ProjectorCondition>("NORMAL");
  const [accessoriesCondition, setAccessoriesCondition] =
    useState<AccessoriesCondition>("COMPLETE");
  const [note, setNote] = useState("");
  const [evidencePhoto, setEvidencePhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<ReturnInspectionValidationErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnInspectionResult | null>(null);

  const submittingRef = useRef(false);
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  const photoRequired = isEvidencePhotoRequired(projectorCondition, accessoriesCondition);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!file) {
      setEvidencePhoto(null);
      return;
    }

    const fileError = validateEvidencePhotoFile(file, photoRequired);
    if (fileError) {
      setEvidencePhoto(null);
      setFieldErrors((prev) => ({ ...prev, evidencePhoto: fileError }));
      return;
    }

    setEvidencePhoto(file);
    setFieldErrors((prev) => ({ ...prev, evidencePhoto: undefined }));
    setPreviewUrl(URL.createObjectURL(file));
  };

  const getIdempotencyKey = (signature: string) => {
    if (idempotencyRef.current && idempotencyRef.current.signature === signature) {
      return idempotencyRef.current.key;
    }
    const key = createIdempotencyKey();
    idempotencyRef.current = { signature, key };
    return key;
  };

  const handleRequestConfirm = () => {
    setSubmitError(null);
    const errors = validateReturnInspectionForm({
      qrPayload,
      returnedBy,
      representativeName,
      projectorCondition,
      accessoriesCondition,
      note,
      evidencePhoto,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmReturn = async () => {
    if (submittingRef.current) return;

    const formData = new FormData();
    formData.append("qr_payload", qrPayload.trim());
    formData.append("confirmed", "true");
    formData.append("returned_by", returnedBy);
    if (returnedBy === "REPRESENTATIVE") {
      formData.append("representative_name", representativeName.trim());
    }
    formData.append("projector_condition", projectorCondition);
    formData.append("accessories_condition", accessoriesCondition);
    if (note.trim()) {
      formData.append("note", note.trim());
    }
    if (evidencePhoto) {
      formData.append("evidence_photo", evidencePhoto);
    }

    const signature = JSON.stringify({
      loanId: loan.id,
      qrPayload: qrPayload.trim(),
      returnedBy,
      representativeName: representativeName.trim(),
      projectorCondition,
      accessoriesCondition,
      note: note.trim(),
      fileName: evidencePhoto?.name ?? null,
      fileSize: evidencePhoto?.size ?? 0,
    });
    const idempotencyKey = getIdempotencyKey(signature);

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await services.loan.confirmReturn(loan.id, formData, idempotencyKey);
      idempotencyRef.current = null;
      setConfirmOpen(false);
      setResult(res.data);
      onCompleted?.(res.data);
    } catch (err) {
      const normalized = normalizeUnknownError(err);
      setSubmitError(normalized.message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (result) {
    const inMaintenance = result.projector.physical_status === "MAINTENANCE";
    return (
      <Card tone={inMaintenance ? "warning" : "success"}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="primary">Pengembalian Selesai</Badge>
            <StatusBadge status={result.loan.status} />
          </div>
          <CardTitle className="mt-3">Inspeksi &amp; Return Dikonfirmasi</CardTitle>
          <CardDescription>
            Status loan dan status fisik unit diperbarui secara atomik oleh server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[var(--color-muted)]">Kondisi Proyektor</span>
            <StatusBadge status={result.inspection.projector_condition} />
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[var(--color-muted)]">Kelengkapan Aksesori</span>
            <StatusBadge status={result.inspection.accessories_condition} />
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[var(--color-muted)]">Status Fisik Unit Baru</span>
            <StatusBadge status={result.projector.physical_status} />
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[var(--color-muted)]">Waktu Kembali</span>
            <span>{formatJakartaDateTime(result.loan.returned_at)}</span>
          </div>
          {inMaintenance && (
            <Alert tone="warning" title="Unit Masuk Maintenance">
              Unit berstatus <code>MAINTENANCE</code> dan belum dapat dibooking hingga diperiksa dan
              dinyatakan layak melalui halaman Maintenance.
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <Link href="/staff/loans">
            <Button variant="outline" size="sm">
              Kembali ke Daftar Loan
            </Button>
          </Link>
          {inMaintenance && (
            <Link href="/staff/maintenance">
              <Button variant="secondary" size="sm">
                Buka Halaman Maintenance
              </Button>
            </Link>
          )}
        </CardFooter>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="secondary" className="font-mono">
              {loan.id}
            </Badge>
            <StatusBadge status={loan.status} />
          </div>
          <CardTitle className="mt-3">
            Form Inspeksi Pengembalian — {projectorLabel ?? loan.projector_id}
          </CardTitle>
          <CardDescription>
            Periksa kondisi proyektor dan kelengkapan aksesori sebelum mengonfirmasi pengembalian.
            <span className="block font-mono text-xs mt-1">
              Booking ID: {loan.booking_id} • Komting ID: {loan.komting_id}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loan.status !== "ACTIVE" && (
            <Alert tone="warning" title="Loan Tidak Aktif">
              Transaksi loan ini sudah berstatus <strong>{loan.status}</strong>.
            </Alert>
          )}

          {submitError && (
            <Alert tone="danger" title="Konfirmasi Pengembalian Gagal">
              {submitError}
            </Alert>
          )}

          <Input
            id="return-qr-payload"
            label="Token QR Transaksi"
            placeholder="Tempel atau pindai token QR booking..."
            required
            value={qrPayload}
            onChange={(e) => {
              setQrPayload(e.target.value);
              if (fieldErrors.qrPayload) {
                setFieldErrors((prev) => ({ ...prev, qrPayload: undefined }));
              }
            }}
            error={fieldErrors.qrPayload}
            disabled={isSubmitting || loan.status !== "ACTIVE"}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="return-returned-by"
              label="Dikembalikan Oleh"
              value={returnedBy}
              options={[
                { value: "KOMTING", label: "KOMTING — Langsung oleh Komting" },
                { value: "REPRESENTATIVE", label: "REPRESENTATIVE — Oleh Perwakilan" },
              ]}
              onChange={(e) => {
                setReturnedBy(e.target.value as HandoverActorType);
                setFieldErrors((prev) => ({ ...prev, representativeName: undefined }));
              }}
              disabled={isSubmitting || loan.status !== "ACTIVE"}
            />

            {returnedBy === "REPRESENTATIVE" && (
              <Input
                id="return-representative-name"
                label="Nama Perwakilan Pengembali"
                placeholder="Masukkan nama perwakilan..."
                required
                value={representativeName}
                onChange={(e) => {
                  setRepresentativeName(e.target.value);
                  if (fieldErrors.representativeName) {
                    setFieldErrors((prev) => ({ ...prev, representativeName: undefined }));
                  }
                }}
                error={fieldErrors.representativeName}
                disabled={isSubmitting || loan.status !== "ACTIVE"}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="return-projector-condition"
              label="Kondisi Proyektor"
              value={projectorCondition}
              options={[
                { value: "NORMAL", label: "NORMAL — Baik & Berfungsi" },
                { value: "DAMAGED", label: "DAMAGED — Rusak / Bermasalah" },
              ]}
              onChange={(e) => {
                const next = e.target.value as ProjectorCondition;
                setProjectorCondition(next);
                setFieldErrors((prev) => ({ ...prev, evidencePhoto: undefined }));
              }}
              disabled={isSubmitting || loan.status !== "ACTIVE"}
            />

            <Select
              id="return-accessories-condition"
              label="Kelengkapan Aksesori"
              value={accessoriesCondition}
              options={[
                { value: "COMPLETE", label: "COMPLETE — Lengkap" },
                { value: "INCOMPLETE", label: "INCOMPLETE — Ada Komponen Hilang" },
              ]}
              onChange={(e) => {
                const next = e.target.value as AccessoriesCondition;
                setAccessoriesCondition(next);
                setFieldErrors((prev) => ({ ...prev, evidencePhoto: undefined }));
              }}
              disabled={isSubmitting || loan.status !== "ACTIVE"}
            />
          </div>

          {photoRequired && (
            <Alert tone="warning" title="Foto Bukti Wajib Diunggah">
              Karena kondisi proyektor <code>DAMAGED</code> atau aksesori <code>INCOMPLETE</code>,
              Anda wajib mengunggah foto bukti sebelum konfirmasi.
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="return-evidence-photo"
              className="text-sm font-bold text-[var(--color-ink)] inline-flex items-center gap-1"
            >
              <span>Foto Bukti Kondisi / Kelengkapan</span>
              {photoRequired && (
                <span aria-hidden="true" className="text-[#b91c1c]">
                  *
                </span>
              )}
            </label>
            <input
              id="return-evidence-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              disabled={isSubmitting || loan.status !== "ACTIVE"}
              aria-invalid={fieldErrors.evidencePhoto ? true : undefined}
              aria-describedby={
                fieldErrors.evidencePhoto
                  ? "return-evidence-photo-error"
                  : "return-evidence-photo-hint"
              }
              className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-[var(--radius-sm)] file:border-2 file:border-[var(--border-color)] file:bg-[var(--color-secondary)] file:font-bold file:text-[var(--color-ink)] nb-border rounded-[var(--radius-sm)] p-1.5 bg-[var(--color-surface)] cursor-pointer"
            />
            <p id="return-evidence-photo-hint" className="text-xs text-[var(--color-muted)]">
              {photoRequired
                ? "Wajib untuk kondisi DAMAGED atau INCOMPLETE (JPG, PNG, WebP, maks. 5 MB)."
                : "Opsional untuk kondisi normal (JPG, PNG, WebP)."}
            </p>
            {fieldErrors.evidencePhoto && (
              <p
                id="return-evidence-photo-error"
                role="alert"
                className="text-xs font-semibold text-[#991b1b]"
              >
                {fieldErrors.evidencePhoto}
              </p>
            )}

            {previewUrl && (
              <div className="mt-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
                <p className="text-xs font-bold mb-2">Pratinjau Foto Bukti (Lokal)</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Pratinjau foto bukti pengembalian"
                  className="max-h-48 w-auto rounded-[var(--radius-sm)] nb-border object-contain bg-[var(--color-surface)]"
                />
              </div>
            )}
          </div>

          <Textarea
            id="return-note"
            label="Catatan Pemeriksaan"
            placeholder="Catat kondisi fisik, kabel, remote, atau tas proyektor..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isSubmitting || loan.status !== "ACTIVE"}
          />
        </CardContent>

        <CardFooter className="justify-between">
          <span className="text-xs text-[var(--color-muted)]">
            Tidak ada denda atau sanksi otomatis.
          </span>
          <Button
            variant="primary"
            onClick={handleRequestConfirm}
            disabled={isSubmitting || loan.status !== "ACTIVE"}
          >
            Konfirmasi Pengembalian
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          if (!isSubmitting) setConfirmOpen(false);
        }}
        onConfirm={handleConfirmReturn}
        title="Konfirmasi Pengembalian Unit?"
        description={
          photoRequired
            ? "Loan akan ditutup (RETURNED) dan unit akan diarahkan ke status MAINTENANCE sesuai hasil inspeksi."
            : "Loan akan ditutup (RETURNED) dan status unit akan diperbarui sesuai hasil inspeksi server."
        }
        confirmLabel="Ya, Selesaikan Return"
        cancelLabel="Periksa Ulang"
        confirmVariant={photoRequired ? "warning" : "primary"}
        isConfirming={isSubmitting}
      >
        {submitError && (
          <Alert tone="danger" title="Gagal Mengonfirmasi Return">
            {submitError}
          </Alert>
        )}
      </ConfirmDialog>
    </>
  );
}
