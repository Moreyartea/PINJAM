"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/app-shell";
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
import { Textarea } from "@/components/ui/textarea";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { createIdempotencyKey } from "@/lib/utils/idempotency";
import {
  canApproveNewApplication,
  canApproveReplacementApplication,
  canRejectApplication,
  isReplacementApplication,
  validateRejectApplicationForm,
} from "@/lib/validation/admin";
import { isMockMode, services } from "@/services";
import type { KomtingApplication } from "@/types/domain";

type ActionDialogMode = "approve" | "approve-replacement" | "reject" | null;

export function AdminApplicationDetailView({ applicationId }: { applicationId: string }) {
  const [adminNote, setAdminNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectReasonError, setRejectReasonError] = useState<string | undefined>(undefined);

  const [dialogMode, setDialogMode] = useState<ActionDialogMode>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const replacementIdempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  const {
    data: application,
    loading,
    error,
    reload,
  } = useAsyncQuery<KomtingApplication>(async () => {
    const res = await services.application.getAdminApplication(applicationId);
    return res.data;
  }, [applicationId]);

  const getReplacementIdempotencyKey = (signature: string) => {
    if (
      replacementIdempotencyRef.current &&
      replacementIdempotencyRef.current.signature === signature
    ) {
      return replacementIdempotencyRef.current.key;
    }
    const key = createIdempotencyKey();
    replacementIdempotencyRef.current = { signature, key };
    return key;
  };

  const handleOpenRejectDialog = () => {
    setActionError(null);
    const validation = validateRejectApplicationForm({ reason: rejectReason });
    setRejectReasonError(validation.reason);
    if (validation.reason) {
      return;
    }
    setDialogMode("reject");
  };

  const handleConfirmAction = async () => {
    if (!application || !dialogMode || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      if (dialogMode === "approve") {
        const res = await services.application.approveApplication(application.application_id, {
          admin_note: adminNote.trim() || null,
        });
        setDialogMode(null);
        setActionSuccess(
          `Pengajuan disetujui. Penugasan aktif kelas ${res.data.assignment.class_name} (${res.data.assignment.id}) telah dibuat.`
        );
        await reload();
        return;
      }

      if (dialogMode === "approve-replacement") {
        const payload = { admin_note: adminNote.trim() || null };
        const signature = JSON.stringify({
          applicationId: application.application_id,
          ...payload,
        });
        const idempotencyKey = getReplacementIdempotencyKey(signature);
        const res = await services.application.approveReplacement(
          application.application_id,
          payload,
          idempotencyKey
        );
        replacementIdempotencyRef.current = null;
        setDialogMode(null);
        setActionSuccess(
          `Pergantian komting disetujui secara atomik. Penugasan baru aktif untuk kelas ${res.data.assignment.class_name} (${res.data.assignment.id}).`
        );
        await reload();
        return;
      }

      if (dialogMode === "reject") {
        await services.application.rejectApplication(application.application_id, {
          reason: rejectReason.trim(),
        });
        setDialogMode(null);
        setActionSuccess("Pengajuan komting ditolak dan alasan penolakan telah disimpan.");
        await reload();
      }
    } catch (err) {
      setActionError(normalizeUnknownError(err).message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <LoadingState
        title="Memuat Detail Pengajuan Komting..."
        description="Mengambil informasi pendaftar dan status pengajuan dari server."
        rows={4}
      />
    );
  }

  if (error || !application) {
    return (
      <ErrorState
        title="Gagal Memuat Detail Pengajuan"
        message={error?.message ?? "Pengajuan tidak ditemukan."}
        errorCode={error?.code}
        onRetry={reload}
        action={
          <Link href="/admin/applications">
            <Button variant="outline" size="sm">
              Kembali ke Daftar Pengajuan
            </Button>
          </Link>
        }
      />
    );
  }

  const replacement = isReplacementApplication(application);
  const canApproveNew = canApproveNewApplication(application);
  const canApproveReplacement = canApproveReplacementApplication(application);
  const canReject = canRejectApplication(application);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Detail Pengajuan ${application.application_id}`}
        description="Verifikasi identitas calon komting, status pengajuan, dan keputusan administratif."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
            <Link href="/admin/applications">
              <Button variant="outline" size="sm">
                Kembali ke Daftar
              </Button>
            </Link>
          </>
        }
      />

      {actionSuccess && (
        <Alert tone="success" title="Tindakan ADMIN Berhasil">
          {actionSuccess}
        </Alert>
      )}

      {actionError && !dialogMode && (
        <Alert tone="danger" title="Tindakan Gagal Diproses">
          {actionError}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={replacement ? "warning" : "neutral"}>
                  {replacement ? "Pengajuan Pergantian" : "Pengajuan Baru"}
                </Badge>
                <StatusBadge status={application.status} />
              </div>
              <CardTitle className="mt-3">
                {application.full_name ?? application.application_id}
              </CardTitle>
              <CardDescription>
                Diajukan pada {formatJakartaDateTime(application.submitted_at)}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <dl className="grid gap-2.5 p-3.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">ID Pengajuan</dt>
                  <dd className="font-mono font-bold text-right">{application.application_id}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Nama Lengkap</dt>
                  <dd className="font-bold text-right">{application.full_name ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Email</dt>
                  <dd className="text-right">{application.email ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Nomor Identitas</dt>
                  <dd className="font-mono font-bold text-right">
                    {application.student_id ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Kelas</dt>
                  <dd className="font-bold text-right">{application.class_name ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Jenis Pengajuan</dt>
                  <dd className="font-mono font-bold text-right">
                    {application.application_type ?? (replacement ? "REPLACEMENT" : "NEW")}
                  </dd>
                </div>
              </dl>

              {application.admin_note && (
                <Alert tone="info" title="Catatan ADMIN">
                  {application.admin_note}
                </Alert>
              )}

              {application.rejection_reason && (
                <Alert tone="danger" title="Alasan Penolakan">
                  {application.rejection_reason}
                </Alert>
              )}
            </CardContent>

            <CardFooter>
              <Button variant="outline" size="sm" onClick={reload}>
                Muat Ulang Detail
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dokumen Identitas (Privat)</CardTitle>
              <CardDescription>
                Foto identitas disimpan secara privat dan hanya dapat diakses oleh ADMIN melalui
                mekanisme otorisasi backend.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert tone="warning" title="Pratinjau Dokumen Belum Tersedia">
                Pratinjau foto identitas belum dapat ditampilkan karena kontrak API belum
                menyediakan endpoint atau mekanisme akses privat (signed URL) dari backend. Tidak
                ada URL publik yang digunakan demi menjaga privasi dokumen pendaftar.
              </Alert>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {replacement && (
            <Alert tone="warning" title="Alur Pengajuan Pergantian (Replacement)">
              <p>
                Kelas <strong>{application.class_name ?? "terkait"}</strong> terdeteksi memiliki
                komting aktif sehingga pengajuan calon pengganti{" "}
                <strong>{application.full_name ?? application.application_id}</strong> diproses
                sebagai pergantian.
              </p>
              <p className="mt-1">
                Persetujuan pergantian menonaktifkan penugasan komting lama dan mengaktifkan
                penugasan komting baru secara atomik oleh server. Jika ditolak, komting lama tetap
                aktif.
              </p>
            </Alert>
          )}

          {(canApproveNew || canApproveReplacement) && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {canApproveReplacement
                    ? "Persetujuan Pergantian Komting"
                    : "Persetujuan Pengajuan Baru"}
                </CardTitle>
                <CardDescription>
                  {canApproveReplacement
                    ? "Menyetujui pergantian akan mengganti penugasan komting lama secara atomik dengan Idempotency-Key."
                    : "Setujui pengajuan jika identitas dan kelas pendaftar sudah valid."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  id="admin-approve-note"
                  label="Catatan ADMIN (Opsional)"
                  placeholder="Contoh: Dokumen telah diverifikasi."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  disabled={submitting}
                />
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  type="button"
                  variant="primary"
                  disabled={submitting}
                  onClick={() => {
                    setActionError(null);
                    setDialogMode(canApproveReplacement ? "approve-replacement" : "approve");
                  }}
                >
                  {canApproveReplacement ? "Setujui Pergantian Komting" : "Setujui Pengajuan"}
                </Button>
              </CardFooter>
            </Card>
          )}

          {canReject && (
            <Card>
              <CardHeader>
                <CardTitle>Tolak Pengajuan</CardTitle>
                <CardDescription>
                  Alasan penolakan wajib diisi dan akan dikirim kepada pemohon.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  id="admin-reject-reason"
                  label="Alasan Penolakan"
                  placeholder="Contoh: Foto identitas tidak terbaca atau kelas tidak sesuai."
                  required
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (rejectReasonError) setRejectReasonError(undefined);
                  }}
                  error={rejectReasonError}
                  disabled={submitting}
                />
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  type="button"
                  variant="danger"
                  disabled={submitting}
                  onClick={handleOpenRejectDialog}
                >
                  Tolak Pengajuan
                </Button>
              </CardFooter>
            </Card>
          )}

          {!canApproveNew && !canApproveReplacement && !canReject && (
            <Alert tone="info" title="Verifikasi Tidak Tersedia untuk Status Ini">
              {application.status === "PENDING_EMAIL_VERIFICATION"
                ? "Email pemohon belum diverifikasi. Persetujuan atau penolakan hanya dapat dilakukan setelah verifikasi email selesai."
                : `Pengajuan berstatus ${application.status} sudah selesai diproses sehingga tidak dapat disetujui atau ditolak ulang.`}
            </Alert>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={dialogMode === "approve"}
        onClose={() => {
          if (!submitting) setDialogMode(null);
        }}
        onConfirm={handleConfirmAction}
        title="Setujui Pengajuan Komting?"
        description={`Pemohon ${application.full_name ?? application.application_id} akan diaktifkan sebagai komting untuk kelas ${application.class_name ?? "-"}.`}
        confirmLabel="Ya, Setujui Pengajuan"
        cancelLabel="Batal"
        isConfirming={submitting}
      >
        {actionError && dialogMode === "approve" && (
          <Alert tone="danger" title="Persetujuan Gagal">
            {actionError}
          </Alert>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialogMode === "approve-replacement"}
        onClose={() => {
          if (!submitting) setDialogMode(null);
        }}
        onConfirm={handleConfirmAction}
        title="Konfirmasi Pergantian Komting?"
        description={`Penugasan komting aktif yang ada pada kelas ${application.class_name ?? "-"} akan dinonaktifkan dan digantikan oleh ${application.full_name ?? application.application_id} secara atomik. Tindakan ini dicatat di audit log.`}
        confirmLabel="Ya, Setujui Pergantian"
        cancelLabel="Periksa Ulang"
        confirmVariant="warning"
        isConfirming={submitting}
      >
        {actionError && dialogMode === "approve-replacement" && (
          <Alert tone="danger" title="Persetujuan Pergantian Gagal">
            {actionError}
          </Alert>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialogMode === "reject"}
        onClose={() => {
          if (!submitting) setDialogMode(null);
        }}
        onConfirm={handleConfirmAction}
        title="Tolak Pengajuan Komting?"
        description={
          replacement
            ? "Pengajuan pergantian akan ditolak dan penugasan komting lama tetap aktif."
            : "Pengajuan akan berstatus REJECTED dan alasan penolakan akan disimpan."
        }
        confirmLabel="Ya, Tolak Pengajuan"
        cancelLabel="Batal"
        confirmVariant="danger"
        isConfirming={submitting}
      >
        {actionError && dialogMode === "reject" && (
          <Alert tone="danger" title="Penolakan Gagal">
            {actionError}
          </Alert>
        )}
      </ConfirmDialog>
    </div>
  );
}
