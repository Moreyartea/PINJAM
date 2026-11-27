"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { normalizeUnknownError } from "@/lib/api/errors";
import {
  validateDeactivateAssignmentForm,
  type DeactivateAssignmentValidationErrors,
} from "@/lib/validation/admin";
import { isMockMode, services } from "@/services";

export function AdminAssignmentsView() {
  const [assignmentId, setAssignmentId] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<DeactivateAssignmentValidationErrors>({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const submittingRef = useRef(false);

  const handleRequestDeactivate = (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    const errors = validateDeactivateAssignmentForm({ assignmentId, reason });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setConfirmOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const targetId = assignmentId.trim();
      await services.application.deactivateAssignment(targetId, {
        reason: reason.trim(),
      });
      setConfirmOpen(false);
      setAssignmentId("");
      setReason("");
      setFieldErrors({});
      setActionSuccess(
        `Assignment komting (${targetId}) berhasil dinonaktifkan oleh server. Booking belum diambil dibatalkan dan perubahan dicatat pada audit log.`
      );
    } catch (err) {
      setConfirmOpen(false);
      setActionError(normalizeUnknownError(err).message);
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Assignment Komting"
        description="Pengelolaan penugasan komting aktif per kelas oleh ADMIN sesuai aturan integritas backend."
        actions={
          <>
            <Badge tone="warning" symbol="!">
              DUKUNGAN PARSIAL KONTRAK
            </Badge>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/admin">
              <Button variant="outline" size="sm">
                Kembali ke Dashboard
              </Button>
            </Link>
          </>
        }
      />

      <Alert
        tone="warning"
        title="Daftar &amp; Detail Assignment Komting Belum Tersedia di API Contract"
      >
        <p>
          <strong>API_CONTRACT_PINJAM.md (v1.0.0)</strong> belum menyediakan endpoint untuk daftar (
          <code>GET /api/v1/admin/komting/assignments</code>) maupun detail (
          <code>GET /api/v1/admin/komting/assignments/{"{assignment_id}"}</code>) penugasan komting.
        </p>
        <p className="mt-1">
          Endpoint daftar pengajuan (<code>/api/v1/admin/komting/applications</code>) hanya memuat
          status aplikasi pendaftaran dan <strong>tidak</strong> merepresentasikan daftar penugasan
          aktif. Frontend tidak mengarang data penugasan maupun mengaktifkan penugasan secara lokal.
        </p>
      </Alert>

      <EmptyState
        title="Daftar Penugasan Komting Menunggu Endpoint Resmi Backend"
        description="Tabel penugasan aktif, identitas kelas, riwayat tanggal mulai/berakhir, filter, dan pagination akan ditampilkan setelah endpoint daftar dan detail assignment tersedia di API Contract. Untuk pengajuan baru maupun proses pergantian komting (replacement), gunakan modul Pengajuan Komting."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/applications">
              <Button variant="primary" size="sm">
                Buka Verifikasi &amp; Pergantian Komting
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline" size="sm">
                Kembali ke Dashboard ADMIN
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Nonaktifkan Assignment Komting</CardTitle>
              <Badge tone="secondary">§6.8 TERSEDIA DI KONTRAK</Badge>
            </div>
            <CardDescription>
              Endpoint resmi{" "}
              <code>POST /api/v1/admin/komting/assignments/{"{assignment_id}"}/deactivate</code>{" "}
              untuk menonaktifkan penugasan komting berdasarkan ID assignment dari backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionSuccess && (
              <Alert tone="success" title="Penonaktifan Assignment Berhasil">
                {actionSuccess}
              </Alert>
            )}

            {actionError && (
              <Alert tone="danger" title="Penonaktifan Assignment Gagal">
                {actionError}
              </Alert>
            )}

            <Alert tone="info" title="Dampak Penonaktifan Assignment (§6.8)">
              <ul className="list-disc pl-4 space-y-1">
                <li>Booking yang belum diambil (CONFIRMED) akan dibatalkan oleh backend.</li>
                <li>Loan aktif tetap berjalan normal sampai pengembalian selesai.</li>
                <li>Komting yang nonaktif tidak dapat membuat booking baru.</li>
                <li>Semua pembatalan dan perubahan dicatat pada audit log.</li>
              </ul>
            </Alert>

            <form
              id="deactivate-assignment-form"
              noValidate
              onSubmit={handleRequestDeactivate}
              className="space-y-4"
            >
              <Input
                id="deactivate-assignment-id"
                label="ID Assignment Komting"
                required
                placeholder="Masukkan assignment_id valid dari backend"
                value={assignmentId}
                error={fieldErrors.assignmentId}
                onChange={(e) => {
                  setAssignmentId(e.target.value);
                  if (fieldErrors.assignmentId) {
                    setFieldErrors((prev) => ({ ...prev, assignmentId: undefined }));
                  }
                }}
              />

              <Textarea
                id="deactivate-assignment-reason"
                label="Alasan Penonaktifan"
                required
                rows={3}
                placeholder="Contoh: Pergantian pengurus kelas atau komting mengundurkan diri."
                value={reason}
                error={fieldErrors.reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (fieldErrors.reason) {
                    setFieldErrors((prev) => ({ ...prev, reason: undefined }));
                  }
                }}
              />

              <Button type="submit" variant="danger" disabled={submitting}>
                Nonaktifkan Assignment
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aturan Domain &amp; Gap Kontrak Assignment</CardTitle>
            <CardDescription>
              Batasan integritas yang dijaga frontend dan backend sesuai PRD &amp; API Contract:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">1. Unik per Kelas &amp; per Mahasiswa</p>
                <Badge tone="neutral">Aturan Backend</Badge>
              </div>
              <p className="text-[var(--color-muted)]">
                Satu kelas hanya boleh memiliki satu komting aktif, dan satu mahasiswa hanya boleh
                memiliki satu penugasan komting aktif.
              </p>
            </div>

            <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">2. Penggantian Wajib Melalui Verifikasi ADMIN</p>
                <Badge tone="neutral">Atomik (§6.7)</Badge>
              </div>
              <p className="text-[var(--color-muted)]">
                Penggantian komting tidak boleh dilakukan langsung tanpa proses persetujuan. Jika
                pengajuan penggantian ditolak, komting lama tetap aktif; jika disetujui, pergantian
                assignment lama dan baru berjalan secara atomik di backend melalui{" "}
                <code>/admin/applications</code>.
              </p>
            </div>

            <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">3. Daftar &amp; Detail Assignment</p>
                <Badge tone="warning">Belum Ada di Kontrak</Badge>
              </div>
              <p className="text-[var(--color-muted)]">
                Menunggu endpoint resmi daftar dan detail assignment beserta filter kelas/status,
                tanggal mulai/berakhir, serta pagination sebelum menampilkan tabel assignment.
              </p>
            </div>
          </CardContent>
          <CardFooter className="text-xs text-[var(--color-muted)]">
            Penugasan baru hanya aktif setelah verifikasi backend dan tidak pernah diaktifkan secara
            lokal oleh browser.
          </CardFooter>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Konfirmasi Penonaktifan Assignment Komting"
        description={`Nonaktifkan assignment ${assignmentId.trim()}? Booking yang belum diambil akan dibatalkan oleh backend, sedangkan loan aktif tetap berjalan hingga dikembalikan.`}
        confirmLabel="Ya, Nonaktifkan"
        cancelLabel="Batal"
        confirmVariant="danger"
        isConfirming={submitting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
}
